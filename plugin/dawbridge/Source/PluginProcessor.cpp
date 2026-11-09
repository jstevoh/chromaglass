#include "PluginProcessor.h"
#include "PluginEditor.h"

#include <cmath>
#include <cstring>

#if JUCE_MAC || JUCE_IOS
 #include <time.h>
#endif

namespace dawbridge
{

// ── The slots ────────────────────────────────────────────────────────

SlotParameter::SlotParameter (int i)
    : juce::AudioParameterFloat (juce::ParameterID { "slot" + juce::String (i + 1), 1 },
                                 "Slot " + juce::String (i + 1),
                                 juce::NormalisableRange<float> (0.0f, 1.0f),
                                 0.0f),
      index (i)
{
}

juce::String SlotParameter::getName (int maximumStringLength) const
{
    // The name the DAW shows on the lane. A slot keeps its number first, so a lane the
    // owner automated as `Slot 4` stays findable after the app names it.
    juce::String bound;
    {
        const juce::SpinLock::ScopedLockType lock (nameLock);
        bound = boundName;
    }
    auto name = "Slot " + juce::String (index + 1);
    if (bound.isNotEmpty())
        name << " " << juce::String::fromUTF8 ("\xc2\xb7") << " " << bound;
    return name.substring (0, maximumStringLength);
}

void SlotParameter::setBoundName (const juce::String& name)
{
    const juce::SpinLock::ScopedLockType lock (nameLock);
    boundName = name;
}

juce::String SlotParameter::getBoundName() const
{
    const juce::SpinLock::ScopedLockType lock (nameLock);
    return boundName;
}

// ── Construction ─────────────────────────────────────────────────────

static juce::String makeInstanceId()
{
    // Random and fixed for the instance's life: the show server follows one instance by
    // the address its datagrams come from, and the id is what the app shows and what a
    // bye names.
    auto& r = juce::Random::getSystemRandom();
    return juce::String::toHexString (r.nextInt64()).paddedLeft ('0', 16).substring (0, 16);
}

DawBridgeProcessor::DawBridgeProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      juce::Thread ("DawBridge sender"),
      instanceId (makeInstanceId()),
      hostName (juce::PluginHostType().getHostDescription())
{
    for (int i = 0; i < kSlots; ++i)
    {
        auto* p = new SlotParameter (i);
        slots[(size_t) i] = p;
        addParameter (p);
    }
    lastSlot.fill (-1.0f);

    sampleRing.allocate ((size_t) kSampleCapacity, true);
    eventRing.allocate ((size_t) kEventCapacity, true);
    packetScratch.allocate ((size_t) (kMaxPcmFrames * 2), true);

    // One socket on loopback, port chosen by the system, shared by the sender and the
    // receiver so the names come back to where the hello came from.
    if (socket.bindToPort (0, "127.0.0.1"))
    {
        sender.connectToSocket (socket, "127.0.0.1", port.load());
        receiver.connectToSocket (socket);
        receiver.addListener (this, juce::OSCAddress (kNames));
    }

    startThread (juce::Thread::Priority::high);
}

DawBridgeProcessor::~DawBridgeProcessor()
{
    cancelPendingUpdate();
    receiver.removeListener (this);
    receiver.disconnect();

    // The sender thread first, so this thread can send the bye with no one else on the
    // socket: the plugin removed from the track, or the DAW closing.
    signalThreadShouldExit();
    wake.signal();
    stopThread (2000);
    if (helloing)
        sendBye();
    sender.disconnect();
    socket.shutdown();
}

void DawBridgeProcessor::setPort (int newPort)
{
    port.store (juce::jlimit (1, 65535, newPort));
}

// ── The audio thread ─────────────────────────────────────────────────

bool DawBridgeProcessor::pushEvent (const BridgeEvent& e) noexcept
{
    const auto scope = eventFifo.write (1);
    if (scope.blockSize1 + scope.blockSize2 < 1)
    {
        droppedEvents.fetch_add (1);
        return false;
    }
    eventRing[scope.blockSize1 > 0 ? scope.startIndex1 : scope.startIndex2] = e;
    return true;
}

void DawBridgeProcessor::prepareToPlay (double rate, int)
{
    // Not the audio thread, but never at the same time as it: the host calls prepare
    // and process one after the other, so the FIFOs keep their single producer.
    sampleRate.store (rate);
    framesSincePrepare = 0;
    lastTransportFrame = 0;
    haveTransport = false;
    lastSlot.fill (-1.0f);

    BridgeEvent e;
    e.kind = BridgeEvent::helloKind;
    pushEvent (e);
    wake.signal();
}

void DawBridgeProcessor::releaseResources()
{
    // The contract's bye "on release". A host that prepares again gets a fresh hello,
    // which the show server follows as it follows any.
    BridgeEvent e;
    e.kind = BridgeEvent::byeKind;
    pushEvent (e);
    wake.signal();
}

bool DawBridgeProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())
        return false;
    return layouts.getMainInputChannelSet() == out;
}

void DawBridgeProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;
    const auto numSamples = buffer.getNumSamples();
    const auto numIn = getTotalNumInputChannels();

    // The audio passes through untouched: the input channels are the output channels,
    // and any output past the inputs is cleared, as an effect with no input there owes.
    for (auto ch = numIn; ch < getTotalNumOutputChannels(); ++ch)
        buffer.clear (ch, 0, numSamples);

    // The slots: one message a slot a block at most, and only on a change.
    for (int i = 0; i < kSlots; ++i)
    {
        const auto v = slots[(size_t) i]->get();
        if (v != lastSlot[(size_t) i])
        {
            BridgeEvent e;
            e.kind = BridgeEvent::slotKind;
            e.slot = i;
            e.value = v;
            if (pushEvent (e))
                lastSlot[(size_t) i] = v;
        }
    }

    pushTransport (numSamples);

    if (numIn > 0 && numSamples > 0)
        pushPcm (buffer, juce::jmin (2, numIn), numSamples);

    framesSincePrepare += numSamples;
    // No wake.signal() here: JUCE's WaitableEvent::signal() takes a std::mutex that the
    // sender thread holds inside wait(), so signalling from the audio thread could block it
    // behind a lower-priority thread. The sender polls every 5 ms instead, well inside the
    // 10 ms transport throttle, so nothing the app sees arrives later than it already could.
}

void DawBridgeProcessor::pushTransport (int numSamples) noexcept
{
    juce::ignoreUnused (numSamples);
    auto* head = getPlayHead();
    if (head == nullptr)
        return;
    const auto pos = head->getPosition();
    if (! pos.hasValue())
        return;

    const auto rate = sampleRate.load();
    const bool playing = pos->getIsPlaying();
    const double bpm = pos->getBpm().orFallback (lastBpm > 0.0 ? lastBpm : 120.0);
    const double ppq = pos->getPpqPosition().orFallback (0.0);
    const auto sig = pos->getTimeSignature().orFallback (juce::AudioPlayHead::TimeSignature {});
    // The bar's start where the host says it; where it does not, worked from the
    // signature as a bar of `numerator` notes of 1/denominator, in quarter notes.
    const double barLength = sig.numerator * 4.0 / juce::jmax (1, sig.denominator);
    const double barStart = pos->getPpqPositionOfLastBarStart()
                                .orFallback (std::floor (ppq / barLength) * barLength);

    // When to speak: at once on a change of play state or tempo or on a locate (the
    // song position somewhere the last one and the tempo do not put it), else every
    // 10 ms while playing. The 250 ms heartbeat while stopped is the sender's, since a
    // host may stop calling processBlock on a stopped, silent track.
    const double elapsed = (double) (framesSincePrepare - lastTransportFrame) / rate;
    const double expected = lastPpq + (lastPlaying ? elapsed * lastBpm / 60.0 : 0.0);
    const bool changed = ! haveTransport || playing != lastPlaying || bpm != lastBpm
                         || std::abs (ppq - expected) > 0.05;
    const bool due = playing && elapsed >= kTransportPlayingEverySeconds;
    if (! changed && ! due)
        return;

    BridgeEvent e;
    e.kind = BridgeEvent::transportKind;
    e.playing = playing ? 1 : 0;
    e.bpm = (float) bpm;
    // The position as two numbers, since juce_osc has no double: a float32 song
    // position is a quarter of a millisecond off by bar 500.
    auto whole = std::floor (ppq);
    auto fraction = (float) (ppq - whole);
    if (fraction >= 1.0f) { whole += 1.0; fraction = 0.0f; }
    e.beatWhole = (int) whole;
    e.beatFraction = fraction;
    e.barBeat = (float) juce::jmax (0.0, ppq - barStart);
    e.numerator = sig.numerator;
    e.denominator = sig.denominator;

    // When this block's first sample is heard, where the host says when it renders for:
    // an AU's render time stamp is the host time the buffer is for. Anything outside
    // half a second is a host meaning something else, and 0 is the contract's unknown.
    e.ahead = 0.0f;
   #if JUCE_MAC || JUCE_IOS
    if (const auto hostNs = pos->getHostTimeNs(); hostNs.hasValue())
    {
        const auto nowNs = clock_gettime_nsec_np (CLOCK_UPTIME_RAW);
        const auto ahead = ((double) *hostNs - (double) nowNs) / 1.0e9;
        if (ahead > 0.0 && ahead < 0.5)
            e.ahead = (float) ahead;
    }
   #endif

    if (pushEvent (e))
    {
        haveTransport = true;
        lastPlaying = playing;
        lastBpm = bpm;
        lastPpq = ppq;
        lastTransportFrame = framesSincePrepare;
    }
}

void DawBridgeProcessor::pushPcm (const juce::AudioBuffer<float>& buffer, int channels, int numSamples) noexcept
{
    // The samples first, then the event that points at them, so the sender never finds
    // an event whose samples are not there yet. With no room for both, the block is
    // dropped whole, and the next packet's sequence says how many frames went missing.
    const auto needed = numSamples * channels;
    if (sampleFifo.getFreeSpace() < needed || eventFifo.getFreeSpace() < 1)
    {
        droppedEvents.fetch_add (1);
        return;
    }

    const auto scope = sampleFifo.write (needed);
    auto put = [&] (int k, float v) {
        const auto at = k < scope.blockSize1 ? scope.startIndex1 + k : scope.startIndex2 + (k - scope.blockSize1);
        sampleRing[at] = v;
    };
    for (int n = 0; n < numSamples; ++n)
        for (int c = 0; c < channels; ++c)
            put (n * channels + c, buffer.getSample (c, n));

    BridgeEvent e;
    e.kind = BridgeEvent::pcmKind;
    e.startFrame = framesSincePrepare;
    e.numFrames = numSamples;
    e.channels = channels;
    pushEvent (e);
}

// ── The sender thread ────────────────────────────────────────────────

void DawBridgeProcessor::run()
{
    while (! threadShouldExit())
    {
        wake.wait (5);
        drainEvents();

        const auto now = juce::Time::getMillisecondCounterHiRes();
        if (helloing && now - lastHelloMs >= kHelloEverySeconds * 1000.0)
            sendHello();
        if (helloing && haveSentTransport && lastTransport.playing == 0
            && now - lastTransportMs >= kTransportStoppedEverySeconds * 1000.0)
            sendTransport (lastTransport);
    }
}

void DawBridgeProcessor::drainEvents()
{
    for (;;)
    {
        BridgeEvent e;
        {
            const auto scope = eventFifo.read (eventFifo.getNumReady() > 0 ? 1 : 0);
            if (scope.blockSize1 + scope.blockSize2 < 1)
                return;
            e = eventRing[scope.blockSize1 > 0 ? scope.startIndex1 : scope.startIndex2];
        }

        switch (e.kind)
        {
            case BridgeEvent::helloKind:
                helloing = true;
                haveSentTransport = false;
                sendHello();
                break;
            case BridgeEvent::byeKind:
                if (helloing)
                    sendBye();
                helloing = false;
                break;
            case BridgeEvent::slotKind:
            {
                juce::OSCMessage m { juce::OSCAddressPattern (kSlot) };
                m.addInt32 (e.slot);
                m.addFloat32 (e.value);
                send (m);
                break;
            }
            case BridgeEvent::transportKind:
                sendTransport (e);
                break;
            case BridgeEvent::pcmKind:
                sendPcm (e);
                break;
        }
    }
}

void DawBridgeProcessor::send (const juce::OSCMessage& m)
{
    sender.sendToIPAddress ("127.0.0.1", port.load(), m);
}

void DawBridgeProcessor::sendHello()
{
    juce::OSCMessage m { juce::OSCAddressPattern (kHello) };
    m.addInt32 (kProtocol);
    m.addString (instanceId);
    m.addString (hostName);
    m.addFloat32 ((float) sampleRate.load());
    // The plugin's own latency plus the host's output latency; the host's is not
    // something either format tells a plugin, so this is the plugin's own (none).
    m.addInt32 (getLatencySamples());
    send (m);
    lastHelloMs = juce::Time::getMillisecondCounterHiRes();
}

void DawBridgeProcessor::sendTransport (const BridgeEvent& e)
{
    juce::OSCMessage m { juce::OSCAddressPattern (kTransport) };
    m.addInt32 (e.playing);
    m.addFloat32 (e.bpm);
    m.addInt32 (e.beatWhole);
    m.addFloat32 (e.beatFraction);
    m.addFloat32 (e.barBeat);
    m.addInt32 (e.numerator);
    m.addInt32 (e.denominator);
    m.addFloat32 (e.ahead);
    send (m);
    lastTransport = e;
    haveSentTransport = true;
    lastTransportMs = juce::Time::getMillisecondCounterHiRes();
}

void DawBridgeProcessor::sendPcm (const BridgeEvent& e)
{
    // The block's samples, in packets of at most 512 frames, each stamped with the
    // frame index of its first frame since prepareToPlay, wrapping at 2^31.
    static_assert (sizeof (float) == 4, "the blob is float32");
    for (int done = 0; done < e.numFrames;)
    {
        const auto frames = juce::jmin (kMaxPcmFrames, e.numFrames - done);
        const auto count = frames * e.channels;
        const auto scope = sampleFifo.read (count);
        for (int k = 0; k < count; ++k)
            packetScratch[k] = sampleRing[k < scope.blockSize1 ? scope.startIndex1 + k
                                                               : scope.startIndex2 + (k - scope.blockSize1)];

        // Little-endian, as the contract's blob is, whatever this machine's order.
        juce::MemoryBlock blob ((size_t) count * 4);
        auto* out = static_cast<uint8_t*> (blob.getData());
        for (int k = 0; k < count; ++k)
        {
            uint32_t bits;
            std::memcpy (&bits, &packetScratch[k], 4);
            out[4 * k + 0] = (uint8_t) (bits & 0xff);
            out[4 * k + 1] = (uint8_t) ((bits >> 8) & 0xff);
            out[4 * k + 2] = (uint8_t) ((bits >> 16) & 0xff);
            out[4 * k + 3] = (uint8_t) ((bits >> 24) & 0xff);
        }

        juce::OSCMessage m { juce::OSCAddressPattern (kPcm) };
        m.addInt32 (e.channels);
        m.addInt32 ((juce::int32) std::lround (sampleRate.load()));
        m.addInt32 ((juce::int32) ((e.startFrame + done) & 0x7fffffff));
        m.addBlob (std::move (blob));
        send (m);
        done += frames;
    }
}

void DawBridgeProcessor::sendBye()
{
    juce::OSCMessage m { juce::OSCAddressPattern (kBye) };
    m.addString (instanceId);
    send (m);
}

// ── The app's names ──────────────────────────────────────────────────

void DawBridgeProcessor::oscMessageReceived (const juce::OSCMessage& m)
{
    if (m.size() != kSlots)
        return;
    juce::StringArray names;
    for (const auto& a : m)
    {
        if (! a.isString())
            return;
        names.add (a.getString());
    }
    {
        const juce::SpinLock::ScopedLockType lock (pendingLock);
        pendingNames = std::move (names);
    }
    heardFromApp.store (true);
    namesAtMs.store (juce::Time::getMillisecondCounterHiRes());
    triggerAsyncUpdate();
}

double DawBridgeProcessor::secondsSinceNames() const
{
    if (! heardFromApp.load())
        return -1.0;
    return (juce::Time::getMillisecondCounterHiRes() - namesAtMs.load()) / 1000.0;
}

void DawBridgeProcessor::handleAsyncUpdate()
{
    juce::StringArray names;
    {
        const juce::SpinLock::ScopedLockType lock (pendingLock);
        names = pendingNames;
    }
    bool changed = false;
    for (int i = 0; i < kSlots && i < names.size(); ++i)
    {
        auto& p = *slots[(size_t) i];
        if (p.getBoundName() != names[i])
        {
            p.setBoundName (names[i]);
            changed = true;
        }
    }
    // The hello brings the names every time; the host hears only of a real change.
    // Live and Logic differ in whether a lane's title follows (docs/dawbridge.md).
    if (changed)
        updateHostDisplay (ChangeDetails {}.withParameterInfoChanged (true));
    namesChanged.sendChangeMessage();
}

// ── State ────────────────────────────────────────────────────────────

void DawBridgeProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    juce::ValueTree state ("DawBridge");
    state.setProperty ("port", port.load(), nullptr);
    for (int i = 0; i < kSlots; ++i)
        state.setProperty ("slot" + juce::String (i + 1), slots[(size_t) i]->get(), nullptr);
    juce::MemoryOutputStream out (destData, false);
    state.writeToStream (out);
}

void DawBridgeProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    const auto state = juce::ValueTree::readFromData (data, (size_t) sizeInBytes);
    if (! state.hasType ("DawBridge"))
        return;
    setPort ((int) state.getProperty ("port", kPort));
    for (int i = 0; i < kSlots; ++i)
    {
        const auto key = "slot" + juce::String (i + 1);
        if (state.hasProperty (key))
            slots[(size_t) i]->setValueNotifyingHost ((float) state.getProperty (key));
    }
}

juce::AudioProcessorEditor* DawBridgeProcessor::createEditor()
{
    return new DawBridgeEditor (*this);
}

} // namespace dawbridge

#if ! DAWBRIDGE_SELFTEST
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new dawbridge::DawBridgeProcessor();
}
#endif
