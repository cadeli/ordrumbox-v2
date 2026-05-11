# orDrumbox - Free Online Drum Machine

orDrumbox is a browser-based beat maker and step sequencer. It provides a creative environment to build drum patterns using acoustic, vintage, and 8-bit kits without any software installation.

## Core Features

### Step Sequencer
- Programmable grid for note entry and track looping
- Support for complex polyrythmie and per-track swing settings
- Precision controls for pitch, volume, and panning per note
- Real-time visual feedback with step-by-step playback

### Synthesis & Automation
- Integrated Soft Synth with 3 VCOs, ADSR envelope, and filters
- LFO modulators for dynamic pitch and volume effects
- Per-track effects: Reverb and Saturation

### Audio & Export
- High-quality WAV export for use in other DAWs
- Real-time audio analysis and visualization
- Multiple drumkits with authentic sounds

### AI Generation
- Automatic Bass Line Generator
- Pattern Generator with style detection

### MIDI Support
- Compatible with external MIDI controllers
- General MIDI (GM) standard support

## Getting Started

### Choosing a Pattern and Drumkit
When you first launch orDrumbox, you can explore the built-in examples using the two dropdown menus located in the toolbar:

- The **KIT** dropdown allows you to select different drumkits (e.g., Real, Electronic, Vintage). Each kit contains a collection of sounds like kick, snare, hi-hat, tom, and more.
- The **PTN** dropdown lets you choose from preset patterns organized by music style (rock, jazz, electronic, etc.).

Select a drumkit and pattern combination, then press the PLAY button to hear the example. This helps you understand how different sounds and patterns work together.

### Adding and Removing Notes
The main grid displays the step sequencer where you can create your own beats:

- **Add a note**: Click on any empty cell in the grid to add a note at that step. The note will play when the sequencer reaches that position during playback.
- **Remove a note**: Click on an existing note in the grid to remove it.
- **Play/Pause**: Use the PLAY button in the toolbar to start or stop the sequencer.

Each column represents a beat step, and each row corresponds to a specific track (e.g., KICK, SNARE, HI-HAT). You can have multiple notes in the same row at different positions.

### Modifying Settings with Sliders and Controls
Each track has adjustable parameters accessible through the track control panel. Use these controls to customize your sound:

- **Volume (velocity)**: Adjust the overall loudness of the track (0 to 1).
- **Pan (PANO)**: Move the sound left or right in the stereo field (-1 to 1).
- **Pitch**: Change the pitch of the sound in semitones.
- **Swing**: Add swing timing to give the groove a more laid-back feel.
- **Loop Step**: Define where the track loops back in the pattern.

The toolbar also includes:
- **BPM**: Set the tempo of the pattern (20 to 250 beats per minute).
- **Pattern Length**: Adjust how many bars the pattern plays before looping.
- **AUTO mode**: Enable automatic pattern generation.

You can also access additional controls by clicking the TOOLS button, which provides options for exporting audio (WAV), clearing the pattern, and more.

### Direct Controls
Use your computer keyboard as a drum pad. Every key is mapped to a specific sound in the selected drumkit for live finger-drumming.

### MIDI Controllers
For more professional setups, orDrumbox is compatible with external MIDI controllers. You can use any MIDI hardware following the General MIDI (GM) standard.

### Data Management
- Import and export patterns as local project files (JSON)
- Save and load your creations



## Technical Details

- Framework: Vanilla JavaScript with ES6 modules
- Build Tool: Vite
- Audio: Web Audio API
- Storage: LocalStorage for persistence, JSON for import/export


Global sound processing:

Compressor: threshold -12dB, ratio 4:1, attack 5ms, release 150ms
HighPass: 35 Hz (removes unwanted low frequencies)
LowPass: 18500 Hz (anti-aliasing)
MasterGain: 4.0 (compensation for Web Audio loudness deficit)

### AUDIO OUTPUT
MasterGain → audioCtx.destination → Speakers / Sound Card


## Resources

- Detailed User Guide: https://www.ordrumbox.com/userguide-ordrumbox-v2.html
- Video Tutorial: https://www.ordrumbox.com/video-tutorial-ordrumbox.html
- GitHub Repository: https://github.com/cadeli/ordrumbox-v2
- Official Website: https://www.ordrumbox.com

## License

orDrumbox is maintained by the community under the GPL V3 License.

---

Copyright 2026 OrDrumbox Team 