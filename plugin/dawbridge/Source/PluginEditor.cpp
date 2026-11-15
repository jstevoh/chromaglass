#include "PluginEditor.h"

namespace dawbridge
{

namespace
{
const juce::Colour kInk { 0xffe8e4dc };
const juce::Colour kDim { 0xff8d877c };
const juce::Colour kGround { 0xff141210 };
const juce::Colour kLive { 0xff7fd18b };
} // namespace

DawBridgeEditor::DawBridgeEditor (DawBridgeProcessor& p)
    : AudioProcessorEditor (p), processor (p)
{
    portLabel.setColour (juce::Label::textColourId, kDim);
    addAndMakeVisible (portLabel);

    portField.setInputRestrictions (5, "0123456789");
    portField.setJustification (juce::Justification::centredLeft);
    portField.setText (juce::String (processor.getPort()), juce::dontSendNotification);
    portField.onReturnKey = [this] { applyPort(); };
    portField.onFocusLost = [this] { applyPort(); };
    addAndMakeVisible (portField);

    processor.namesChanged.addChangeListener (this);
    startTimerHz (4);
    setSize (460, 560);
}

DawBridgeEditor::~DawBridgeEditor()
{
    processor.namesChanged.removeChangeListener (this);
}

void DawBridgeEditor::applyPort()
{
    const auto v = portField.getText().getIntValue();
    if (v >= 1 && v <= 65535)
        processor.setPort (v);
    portField.setText (juce::String (processor.getPort()), juce::dontSendNotification);
}

void DawBridgeEditor::changeListenerCallback (juce::ChangeBroadcaster*) { repaint(); }
void DawBridgeEditor::timerCallback() { repaint(); }

void DawBridgeEditor::paint (juce::Graphics& g)
{
    g.fillAll (kGround);
    auto area = getLocalBounds().reduced (20);

    g.setColour (kInk);
    g.setFont (juce::FontOptions (20.0f, juce::Font::bold));
    g.drawText ("ChromaGlass Bridge", area.removeFromTop (28), juce::Justification::centredLeft);

    // Listening means the app named the slots lately: it answers every hello, and the
    // plugin says hello once a second, so three quiet seconds mean it is not there.
    const auto since = processor.secondsSinceNames();
    const bool live = since >= 0.0 && since < 3.0;
    g.setFont (juce::FontOptions (14.0f));
    g.setColour (live ? kLive : kDim);
    g.drawText (live ? "The app is listening" : "Waiting for the app (Pro, DAW bridge on)",
                area.removeFromTop (22), juce::Justification::centredLeft);
    g.setColour (kDim);
    g.drawText (processor.getHostName() + juce::String::fromUTF8 ("  \xc2\xb7  instance ") + processor.getInstanceId(),
                area.removeFromTop (20), juce::Justification::centredLeft);

    area.removeFromTop (44); // the port row, laid out in resized()

    g.setColour (kDim);
    g.drawText ("Slots, as the app binds them", area.removeFromTop (22), juce::Justification::centredLeft);
    area.removeFromTop (4);

    const auto columnWidth = area.getWidth() / 2;
    const auto rowHeight = juce::jmin (24, area.getHeight() / (kSlots / 2));
    g.setFont (juce::FontOptions (13.0f));
    for (int i = 0; i < kSlots; ++i)
    {
        const auto column = i / (kSlots / 2), row = i % (kSlots / 2);
        juce::Rectangle<int> cell (area.getX() + column * columnWidth, area.getY() + row * rowHeight, columnWidth - 8, rowHeight);
        const auto name = processor.getSlot (i).getBoundName();
        g.setColour (kDim);
        g.drawText (juce::String (i + 1), cell.removeFromLeft (26), juce::Justification::centredRight);
        cell.removeFromLeft (8);
        g.setColour (name.isEmpty() ? kDim.withAlpha (0.5f) : kInk);
        g.drawText (name.isEmpty() ? juce::String ("unbound") : name, cell, juce::Justification::centredLeft, true);
    }
}

void DawBridgeEditor::resized()
{
    auto area = getLocalBounds().reduced (20);
    area.removeFromTop (28 + 22 + 20 + 10);
    auto row = area.removeFromTop (28);
    portLabel.setBounds (row.removeFromLeft (150));
    portField.setBounds (row.removeFromLeft (90));
}

} // namespace dawbridge
