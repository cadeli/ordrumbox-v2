# orDrumbox - Free Online Drum Machine

orDrumbox is a browser-based beat maker and step sequencer. It provides a creative environment to build drum patterns using acoustic, vintage, and 8-bit kits without any software installation.

## Core Features

### Step Sequencer
- Programmable grid for note entry and track looping
- Support for complex polyrhythm and per-track swing settings
- Precision controls for pitch, volume, and panning per note
- Retrigger and Euclidean Fill with visual ghost notes (blue for retrigger, yellow for euclidian)
- Real-time visual feedback with step-by-step playback

### Track Variation
- Per-track variation slider (0–100%) for automatic beat randomization

### Synthesis & Automation
- Integrated Soft Synth with 3 VCOs (sine, triangle, saw, square), ADSR envelope, and filters
- FM synthesis: osc2 modulates osc1 frequency, osc3 modulates osc2 frequency (0–1 depth)
- Filter: TPT SVF with Lowpass, Highpass, Bandpass, Notch modes and adjustable Q (0.1–20)
- Filter envelope modulation (sweeps cutoff from base frequency toward 20 kHz)
- White noise generator with mix and independent highpass filter
- Glide (slide) between notes for portamento effects
- 2 LFOs with target routing: filter freq, per-VCO detune/octave/gain, master volume, noise mix, filter Q, filter envelope amount
- LFO sync to tempo (1/1, 1/2, 1/4, 1/8, 1/16, triplet variants)
- AudioWorklet-based synthesis (requires AudioWorklet support)
- Per-track effects: Reverb, Delay, and Saturation

### Audio & Export
- High-quality WAV export for use in other DAWs
- MIDI import/export with track and program change support
- Real-time audio analysis and visualization
- Multiple drumkits with authentic sounds

### AI Generation
- Automatic Bass Line Generator
- Pattern Generator with style detection

### MCP Server
- Programmatic control via Model Context Protocol (MCP)
- Create and modify patterns via JSON-RPC
- Tools: createNewPattern, addNotesToPattern, updateTrack, setPatternBpm, setPatternTags, and more
- Access to instruments, samples, and pattern management

### MIDI Support
- Compatible with external MIDI controllers
- General MIDI (GM) standard support
- Import MIDI files into patterns (auto-maps instruments and drums)
- Export patterns to MIDI files

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

### Probability Triggers
Each note can use probability triggers to create subtle random variations while the pattern keeps looping:

- **Trigger Probability** controls the chance that the selected note will play after its normal trigger timing. `1` means always play, `0.5` means about half the time, and `0` means never play.
- **Arp Probability** controls the chance that each individual arpeggio note will play. This lets an arpeggio keep its shape while some of its internal notes are randomly skipped.

Both probability controls use values from `0` to `1`, where `1` equals 100%.

### Modifying Settings with Sliders and Controls
Each track has adjustable parameters accessible through the track control panel. Use these controls to customize your sound:

- **Volume (velocity)**: Adjust the overall loudness of the track (0 to 1).
- **Pan (PANO)**: Move the sound left or right in the stereo field (-1 to 1).
- **Pitch**: Change the pitch of the sound in semitones.
- **Swing**: Add swing timing to give the groove a more laid-back feel.
- **Loop Step**: Define where the track loops back in the pattern.
- **AUTO mode**: Enable automatic track generation.


The toolbar also includes:
- **BPM**: Set the tempo of the pattern (20 to 250 beats per minute).
- **Pattern Length**: Adjust how many bars the pattern plays before looping.

You can also access additional controls by clicking the TOOLS button, which provides options for exporting audio (WAV), clearing the pattern, and more.

### Direct Controls
Use your computer keyboard as a drum pad. Every key is mapped to a specific sound in the selected drumkit for live finger-drumming.

### MIDI Controllers
For more professional setups, orDrumbox is compatible with external MIDI controllers. You can use any MIDI hardware following the General MIDI (GM) standard.

### Data Management
- Import and export patterns as local project files (JSON)
- Import MIDI files — automatically maps GM instruments and drums to tracks
- Import WAV/drumkit directories — drag a folder of audio files to create a new drumkit
- Save and load your creations



## Development

```bash
npm install
npm run dev          # Vite dev server (port 3000)
npm test             # Run all tests (Vitest)
npm run test:watch   # Watch mode
npm run test:coverage # Test coverage
npm run build        # Production build
npm run electron:dev # Desktop app (Electron)
npm run electron:build # Build Electron installer (release/)
```

## Technical Details

- Framework: Vanilla JavaScript with ES6 modules
- Build Tool: Vite
- Test Framework: Vitest (93 test files, 1818 tests)
- Audio: Web Audio API with AudioWorklet support
- Node Pool: Recycling of GainNode, BiquadFilterNode, and StereoPannerNode for reduced GC pressure
- Storage: LocalStorage for persistence, JSON for import/export
- Desktop: Electron wrapper
- PWA: Service Worker for offline support
- MCP Server: Standalone Node.js server for programmatic control



Global sound processing:

Compressor: threshold -18dB, ratio 8:1, attack 2ms, release 80ms, knee 3dB, makeup 8dB
Pre-Gain: 0 dB (input gain before compressor)
HighPass: 35 Hz (removes unwanted low frequencies)
LowPass: 18500 Hz (anti-aliasing)
MasterGain: 1.0



## Resources

- Detailed User Guide: https://www.ordrumbox.com/userguide-ordrumbox-v2.html
- Video Tutorial: https://www.ordrumbox.com/video-tutorial-ordrumbox.html
- GitHub Repository: https://github.com/cadeli/ordrumbox-v2
- Official Website: https://www.ordrumbox.com

## Screenshot
![ordrumbox-v2-online-screenshot ](https://www.ordrumbox.com/assets/images/ordrumbox-online-screenshot-small.png "ordrumbox v2 online screenshot")

## License

orDrumbox is maintained by the community under the GPL V3 License.

---

Copyright 2026 OrDrumbox Team 
