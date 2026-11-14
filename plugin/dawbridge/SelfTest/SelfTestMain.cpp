// DawBridgeSelfTest (docs/dawbridge.md, "The plugin"): the real processor, played as a
// host plays it, with no host. Four seconds at 120 bpm in 4/4 at 48 kHz in blocks of
// 256, a 60 Hz kick on every beat, slot 3 moved from 0 to 1 over the run, sent to
// `--port <n>` on 127.0.0.1. `npm run dawbridge -- --plugin` runs it against the real
// show server and holds what arrives to the same lines the node fake is held to.
//
// It plays in real time, a block every 256 / 48000 s by the clock, because that is how
// a host calls processBlock and the sender thread drains what the audio thread wrote:
// played as fast as the CPU goes, the FIFOs would be measured, not the plugin.

#include "../Source/PluginProcessor.h"

#include <juce_events/juce_events.h>

#include <cmath>
#include <cstdio>

namespace
{
constexpr double kRate = 48000.0;
constexpr int kBlock = 256;
constexpr double kBpm = 120.0;
constexpr double kSeconds = 4.0;
constexpr int kMovedSlot = 3;

/** The host's transport: playing from the top, 120 bpm, 4/4. */
class TestPlayHead final : public juce::AudioPlayHead
{
public:
    juce::int64 sample = 0;

    juce::Optional<PositionInfo> getPosition() const override
    {
        PositionInfo info;
        const auto seconds = (double) sample / kRate;
        const auto ppq = seconds * kBpm / 60.0;
        info.setIsPlaying (true);
        info.setBpm (kBpm);
        info.setTimeSignature (TimeSignature { 4, 4 });
        info.setTimeInSamples (sample);
        info.setTimeInSeconds (seconds);
        info.setPpqPosition (ppq);
        info.setPpqPositionOfLastBarStart (std::floor (ppq / 4.0) * 4.0);
        return info;
    }
};

/** A kick: a 60 Hz sine with a fast decay, struck on each beat. */
float kick (juce::int64 sample)
{
    const auto beatSeconds = 60.0 / kBpm;
    const auto t = std::fmod ((double) sample / kRate, beatSeconds);
    return (float) (0.8 * std::sin (juce::MathConstants<double>::twoPi * 60.0 * t) * std::exp (-t * 12.0));
}
} // namespace

int main (int argc, char* argv[])
{
    int port = dawbridge::kPort;
    for (int i = 1; i + 1 < argc; ++i)
        if (juce::String (argv[i]) == "--port")
            port = juce::String (argv[i + 1]).getIntValue();

    juce::ScopedJuceInitialiser_GUI juce;

    auto processor = std::make_unique<dawbridge::DawBridgeProcessor>();
    processor->setPort (port);
    TestPlayHead head;
    processor->setPlayHead (&head);
    processor->setRateAndBufferSizeDetails (kRate, kBlock);
    processor->prepareToPlay (kRate, kBlock);

    juce::AudioBuffer<float> buffer (2, kBlock);
    juce::MidiBuffer midi;
    auto& slot = processor->getSlot (kMovedSlot);
    const auto blocks = (int) std::lround (kSeconds * kRate / kBlock);
    const auto start = juce::Time::getMillisecondCounterHiRes();

    for (int b = 0; b < blocks; ++b)
    {
        head.sample = (juce::int64) b * kBlock;
        for (int n = 0; n < kBlock; ++n)
        {
            const auto v = kick (head.sample + n);
            buffer.setSample (0, n, v);
            buffer.setSample (1, n, v);
        }
        // The automation lane, as a host moves a parameter between blocks.
        slot.setValueNotifyingHost ((float) b / (float) (blocks - 1));
        processor->processBlock (buffer, midi);

        const auto due = start + (b + 1) * kBlock * 1000.0 / kRate;
        for (auto wait = due - juce::Time::getMillisecondCounterHiRes(); wait > 0.0;
             wait = due - juce::Time::getMillisecondCounterHiRes())
            juce::Thread::sleep (wait > 2.0 ? 1 : 0);
    }

    // Let the sender drain, then let go as a host does: release, then the instance gone.
    juce::Thread::sleep (300);
    processor->releaseResources();
    juce::Thread::sleep (100);
    processor->setPlayHead (nullptr);
    processor.reset();

    std::printf ("DawBridgeSelfTest: %d blocks of %d at %.0f Hz, %.0f bpm, to 127.0.0.1:%d in %.2f s\n",
                 blocks, kBlock, kRate, kBpm, port, (juce::Time::getMillisecondCounterHiRes() - start) / 1000.0);
    return 0;
}
