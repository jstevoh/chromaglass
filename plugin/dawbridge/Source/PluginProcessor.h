// The DAW bridge plugin (PLAN 13.7b, docs/dawbridge.md): an AU and VST3 effect that
// passes its audio through untouched and draws nothing on the plate. It sends the
// running ChromaGlass app three things MIDI carries badly or not at all: 32 automation
// slots at full float resolution, the host's transport with the bar's phase exact, and
// the track's own audio as PCM, so the ear hears the DAW's mix with no loopback device.
//
// Two threads, and the line between them is the whole design. The host's audio thread
// calls processBlock, which must never wait on anything: no lock, no allocation, no
// socket. It only reads the play head and the parameters and writes what it saw into
// two lock-free single-producer, single-consumer FIFOs (events, and the samples those
// events point at). A sender thread of the plugin's own drains them and does all the
// talking: OSC over UDP to 127.0.0.1, the hello once a second, the stopped transport's
// heartbeat. A datagram to a closed port costs nothing, so the app need not be running.
//
// The app answers with the slots' names (`/chromaglass/bridge/names`), which arrive on
// the same socket the plugin sends from: the show server replies to the address the
// hello came from, and every instance has its own socket so the server can tell two
// instances apart (the slots, the transport and the audio carry no instance id).

#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_osc/juce_osc.h>

#include <array>
#include <atomic>

#include "BridgeProtocol.h"

namespace dawbridge
{

/**
 * One automation slot. The DAW sees `Slot 1` to `Slot 32` until the app binds them,
 * and then, where the host follows parameter info changes, what each is bound to
 * (`Slot 4 · Swirl`). The value is the parameter's normalised value, 0 to 1, which is
 * what goes on the wire: the app maps it through MIDI learn's map at full resolution.
 */
class SlotParameter final : public juce::AudioParameterFloat
{
public:
    explicit SlotParameter (int index);

    juce::String getName (int maximumStringLength) const override;

    /** The app's name for this slot, "" when unbound. Message thread. */
    void setBoundName (const juce::String& name);
    juce::String getBoundName() const;

    const int index;

private:
    mutable juce::SpinLock nameLock;
    juce::String boundName;
};

/** What the audio thread hands the sender: one event, plain old data. */
struct BridgeEvent
{
    enum Kind : int { helloKind, slotKind, transportKind, pcmKind, byeKind };
    Kind kind = slotKind;

    // slot
    int slot = 0;
    float value = 0.0f;

    // transport (the contract's ,ififfiif)
    int playing = 0;
    float bpm = 120.0f;
    int beatWhole = 0;
    float beatFraction = 0.0f;
    float barBeat = 0.0f;
    int numerator = 4;
    int denominator = 4;
    float ahead = 0.0f;

    // pcm: this many frames of `channels` interleaved samples wait in the sample FIFO,
    // the first of them frame `startFrame` since prepareToPlay.
    juce::int64 startFrame = 0;
    int numFrames = 0;
    int channels = 2;
};

class DawBridgeProcessor final : public juce::AudioProcessor,
                                 private juce::Thread,
                                 private juce::OSCReceiver::ListenerWithOSCAddress<juce::OSCReceiver::RealtimeCallback>,
                                 private juce::AsyncUpdater
{
public:
    DawBridgeProcessor();
    ~DawBridgeProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "ChromaGlass Bridge"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    /** The port on 127.0.0.1 the plugin sends to, kPort until the window changes it. */
    int getPort() const noexcept { return port.load(); }
    void setPort (int newPort);

    /** The host's name as the hello says it ("Ableton Live 12", "Logic Pro"). */
    juce::String getHostName() const { return hostName; }
    const juce::String& getInstanceId() const noexcept { return instanceId; }
    SlotParameter& getSlot (int index) noexcept { return *slots[(size_t) index]; }

    /** True once the app has named the slots at least once: proof it is listening. */
    bool hasHeardFromApp() const noexcept { return heardFromApp.load(); }
    double secondsSinceNames() const;

    /** The editor listens here for the app's names. */
    juce::ChangeBroadcaster namesChanged;

private:
    // The audio thread's side.
    bool pushEvent (const BridgeEvent&) noexcept;
    void pushTransport (int numSamples) noexcept;
    void pushPcm (const juce::AudioBuffer<float>&, int numChannels, int numSamples) noexcept;

    // The sender thread's side.
    void run() override;
    void drainEvents();
    void send (const juce::OSCMessage&);
    void sendHello();
    void sendTransport (const BridgeEvent&);
    void sendPcm (const BridgeEvent&);
    void sendBye();

    // The receiver's (the app's names), handed to the message thread.
    void oscMessageReceived (const juce::OSCMessage&) override;
    void handleAsyncUpdate() override;

    std::array<SlotParameter*, kSlots> slots {};
    const juce::String instanceId;
    const juce::String hostName;
    std::atomic<int> port { kPort };

    // The socket every message goes out of and the names come back to.
    juce::DatagramSocket socket { false };
    juce::OSCSender sender;
    juce::OSCReceiver receiver { "DawBridge names" };

    // The two FIFOs. Sized for the worst a stalled sender could meet: half a second
    // of stereo at 192 kHz, and an event per slot per block for a few hundred blocks.
    static constexpr int kSampleCapacity = 1 << 18;
    static constexpr int kEventCapacity = 1 << 13;
    juce::AbstractFifo sampleFifo { kSampleCapacity };
    juce::HeapBlock<float> sampleRing;
    juce::AbstractFifo eventFifo { kEventCapacity };
    juce::HeapBlock<BridgeEvent> eventRing;
    juce::WaitableEvent wake;
    std::atomic<int> droppedEvents { 0 };

    // The audio thread's own memory of what it last told the sender.
    std::array<float, kSlots> lastSlot {};
    juce::int64 framesSincePrepare = 0;
    juce::int64 lastTransportFrame = 0;
    bool haveTransport = false;
    bool lastPlaying = false;
    double lastBpm = 0.0, lastPpq = 0.0;
    std::atomic<double> sampleRate { 48000.0 };

    // The sender thread's memory.
    bool helloing = false;
    double lastHelloMs = 0.0, lastTransportMs = 0.0;
    BridgeEvent lastTransport;
    bool haveSentTransport = false;
    juce::HeapBlock<float> packetScratch;

    // The app's names, from the receiver thread to the message thread.
    juce::SpinLock pendingLock;
    juce::StringArray pendingNames;
    std::atomic<bool> heardFromApp { false };
    std::atomic<double> namesAtMs { 0.0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DawBridgeProcessor)
};

} // namespace dawbridge
