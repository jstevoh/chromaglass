// The plugin's window: no picture, since the plate is the app's. It says whether the
// app is listening, lets the owner change the port, and lists what each of the 32
// slots is bound to in the app, so a lane in the DAW can be read as "Swirl" even in a
// host whose lane titles do not follow a parameter's new name.

#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "PluginProcessor.h"

namespace dawbridge
{

class DawBridgeEditor final : public juce::AudioProcessorEditor,
                              private juce::ChangeListener,
                              private juce::Timer
{
public:
    explicit DawBridgeEditor (DawBridgeProcessor&);
    ~DawBridgeEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void changeListenerCallback (juce::ChangeBroadcaster*) override;
    void timerCallback() override;
    void applyPort();

    DawBridgeProcessor& processor;
    juce::Label portLabel { {}, "Port on 127.0.0.1" };
    juce::TextEditor portField;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DawBridgeEditor)
};

} // namespace dawbridge
