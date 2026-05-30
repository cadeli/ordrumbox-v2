# OrDrumbox v2 User Manual

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Toolbar](#2-toolbar)
3. [Pattern Panel](#3-pattern-panel)
4. [Track Editor](#4-track-editor)
5. [Note Editor](#5-note-editor)
6. [Tools Panel](#6-tools-panel)
7. [Output Panel](#7-output-panel)
8. [Synth Editor](#8-synth-editor)
9. [Keyboard Shortcuts](#9-keyboard-shortcuts)
10. [Audio Signal Flow](#10-audio-signal-flow)

---

## 1. Getting Started

OrDrumbox v2 is a browser-based drum machine and pattern sequencer. When you open the application, you see:

- **Toolbar** at the top — main controls
- **Pattern Panel** — the step sequencer grid

### Basic Workflow

1. Select a **Pattern** from the Pattern dropdown
2. Click **Start** to begin playback
3. Click on the grid to add/remove notes
4. Click a **track name** to open the Track Editor
5. Click a **note cell** to open the Note Editor
6. Use **Auto Gen** to generate a random pattern

---

## 2. Toolbar

The toolbar is the fixed control bar at the top of the screen.

### Controls

| Button / Control | Description |
|---|---|
| **Start / Stop** | Toggles playback. Red background when running. |
| **BPM** | Click to open the tempo slider (range: 20–250 BPM). |
| **Pattern** | Dropdown to switch between patterns. |
| **Kit** | Dropdown to switch drumkits (samples load on first use). |
| **Auto Gen** | Generates a complete random pattern with genre-appropriate tracks. |
| **Clear** | Removes all notes from the current pattern (asks for confirmation). |
| **Tools** | Opens the Tools panel (export/import, pattern name). |
| **Output** | Opens the Output panel (master mixer, spectrum analyzer). |

---

## 3. Pattern Panel

The Pattern Panel displays all tracks as horizontal step grids below the toolbar.

### Display

- **Pattern name** (red), **BPM**, **bar count**, and **track count** are shown in the header.
- Each track row shows: **track name** + **step grid**.

### Cell Colors

| Appearance | Meaning |
|---|---|
| Dark cell | Empty step |
| Red cell | Note present |
| White outline | Selected note or track |
| Left border | Start of a bar |
| Right white border | Loop point |
| Semi-transparent red (with number) | Note with trigger frequency > 1 |
| Orange (with number) | Note with probability < 1 |
| Yellow line inside cell | Sub-note (retrigger or arp) |

### Interactions

| Action | Result |
|---|---|
| Click empty cell | Creates a note and opens Note Editor |
| Click a note | Selects it and opens Note Editor |
| Click a selected note | Deletes it |
| Click track name | Opens Track Editor for that track |

---

## 4. Track Editor

The Track Editor opens when you click a track name. It contains all track-level parameters organized in groups.

### Basic / Transport

| Control | Description |
|---|---|
| **Mute** | Mutes the entire track |
| **Mono** | Forces monophonic playback |
| **Auto** | Enables auto mode |

### Levels / Pitch

| Control | Range | Default | Description |
|---|---|---|---|
| **Velo** | 0–1 | 1.0 | Track volume multiplier |
| **Pan** | -1 to 1 | 0 | Stereo panning (left/right) |
| **Pitch** | -24 to 24 | 0 | Pitch offset in semitones |
| **Len** | 0–1 | 1.0 | Sample playback length |

All four parameters support LFO modulation (click the row to open LFO settings).

### Filters

| Control | Range | Default | Description |
|---|---|---|---|
| **Type** | lowpass, highpass, bandpass, peaking, lowshelf, highshelf, notch, allpass | allpass | Biquad filter type |
| **Freq** | 0–1 | 20 | Cutoff frequency (normalized, maps to 20Hz–20kHz) |
| **Q** | 0–1 | 0.707 | Filter resonance |

The **Freq** and **Q** parameters support LFO modulation.

### Effects

Each effect has an **LED toggle** (green = active).

#### Reverb

| Control | Options | Default | Description |
|---|---|---|---|
| **LED** | on/off | off | Enable/disable reverb |
| **RevT** | none, room, hall, plate, spring, gated | none | Reverb preset |
| **RevV** | 0–1 | 0 | Wet/dry mix |

**Reverb Presets:**
- **room** — Small room (0.8s decay)
- **hall** — Large hall (2.4s decay)
- **plate** — Plate reverb (1.6s decay)
- **spring** — Spring with ripple (1.2s decay)
- **gated** — Gated reverb (0.7s, cuts off at 65%)

#### Delay

| Control | Options/Range | Default | Description |
|---|---|---|---|
| **LED** | on/off | off | Enable/disable delay |
| **DelTy** | none, slap, tape, pingpong | tape | Delay algorithm |
| **DelT** | 0.0625, 0.125, 0.25, 0.5, 1, 2, 4 | 1 | Delay time (beat multiplier) |
| **DelV** | 0–1 | 0 | Wet mix |

**Delay Types:**
- **slap** — Single echo, short feedback
- **tape** — Tape delay with filter, warm feedback
- **pingpong** — Stereo ping-pong between left and right

#### Saturation

| Control | Options/Range | Default | Description |
|---|---|---|---|
| **LED** | on/off | off | Enable/disable saturation |
| **SatT** | soft, hard, tape | soft | Saturation algorithm |
| **SatV** | 0–1 | 0 | Drive amount |

**Saturation Types:**
- **soft** — Smooth tanh-based clipping
- **hard** — Hard clipping
- **tape** — Analog tape warmth

### LFO Sub-Panel

Click any LFO-capable row (Velo, Pan, Pitch, Freq, Q) to open the LFO editor.

| Control | Range | Default | Description |
|---|---|---|---|
| **LED** | on/off | off | Enable/disable LFO |
| **Freq** | 0.1–16 | 1 | LFO rate (cycles per 4 bars) |
| **Min** | varies | parent min | LFO sweep minimum |
| **Max** | varies | parent max | LFO sweep maximum |
| **Phas** | 0–1 | 0 | Phase offset |

The LFO waveform is always sine.

### Sound Sub-Panel

| Control | Description |
|---|---|
| **Auto LED** | When green, automatically assigns the best sample from the drumkit based on track name |
| **Instr** | Instrument type (shown when auto-assign is off) |
| **Sample** | Specific sample file (shown when auto-assign is off) |
| **Gen** | Soft-synth generated sound selection |
| **Edit** | Opens the Synth Editor for the selected generated sound |

### Loop / Pattern Sub-Panel

| Control | Range | Default | Description |
|---|---|---|---|
| **Steps/Bar** | 1–8 | 4 | Number of steps per bar |
| **Bars** | 1–8 | 4 | Number of bars in the pattern |
| **Loop Point** | 1–(bars×steps/bar) | end | Step where the track loops back |
| **Swing** | 0–1 | 0 | Shuffle amount for odd-numbered steps |

---

## 5. Note Editor

The Note Editor opens when you click a note in the Pattern Panel. It shows per-note parameters.

### Header
- Track name, position (bar X step Y), and close button.

### Vel / Pitch / Pan

| Control | Range | Default | Description |
|---|---|---|---|
| **Vel** | 0–1 | 0.8 | Note velocity (volume) |
| **Pitch** | -24 to 24 | 0 | Semitone offset from C3 |
| **Pan** | -1 to 1 | 0 | Per-note panning |

### Triggers

| Control | Range | Default | Description |
|---|---|---|---|
| **TrigF** | 1–16 | 1 | Play every N-th loop (1 = every loop) |
| **TrigP** | 0–15 | 0 | Phase offset for trigger frequency |
| **Trig%** | 0–1 | 1 | Probability of triggering (1 = 100%) |
| **Euc** | 0–16 | 0 | Euclidean fill: adds N evenly-spaced sub-hits |

**How triggers work:**
A note triggers when: `(currentLoop + triggerPhase) % triggerFreq === 0`

**Euclidean fill:**
Adds N evenly-spaced notes between this note and the next note in the track, creating complex rhythmic patterns.

### Arpeggiator

| Control | Options/Range | Default | Description |
|---|---|---|---|
| **Scl** | major, minor, pentatonic, etc. | major | Musical scale for arp intervals |
| **Dir** | up, down, updown | up | Arpeggio direction |
| **Rng** | 0–12 | 0 | Number of arp notes (0 = disabled) |
| **Arp%** | 0–1 | 1 | Probability each arp note triggers |
| **Retrig** | 1–16 | 1 | Number of retrigger sub-hits |
| **RetS** | 1–16 | 1 | Spacing between retrigger hits |

**How arpeggiator works:**
- When `Rng > 0`, generates pitch offsets from the selected scale
- Each arp note gets a random probability check
- If both arp and retrigger are active, arp provides pitch offsets and retrigger provides the count

---

## 6. Tools Panel

The Tools Panel opens when clicking the "Tools" button in the toolbar.

### Pattern Settings

| Control | Description |
|---|---|
| **Name** | Text input to rename the current pattern |

### Export

| Button | Format | Description |
|---|---|---|
| **Export JSON** | `.json` | Exports pattern data (strips defaults, keeps only changed values) |
| **Export MIDI** | `.mid` | Exports as Standard MIDI File (SMF Type 1, multi-track) |
| **Export WAV** | `.wav` | Renders audio using OfflineAudioContext |

| Control | Range | Default | Description |
|---|---|---|---|
| **Loops** | 1–32 | 1 | Number of times pattern loops in WAV/MIDI export |

**Export filenames:** `ordrumbox-{patternName}.{ext}`

**MIDI Export details:**
- Track 0: Tempo + time signature
- Track 1+: One MIDI track per instrument
- Drum tracks → MIDI channel 10
- Muted tracks are excluded

### Import

| Button | Description |
|---|---|
| **Import JSON** | Opens file picker for `.json` files, imports as a new pattern |

---

## 7. Output Panel

The Output Panel opens when clicking the "Output" button in the toolbar. It provides master mixing controls and a real-time spectrum analyzer.

### Master

| Control | Range | Default | Description |
|---|---|---|---|
| **Volume** | 0–2 | 1.0 | Master output volume |

### Filters (Master)

| Control | Range | Default | Description |
|---|---|---|---|
| **Low Cut** | 10–500 Hz | 35 Hz | High-pass filter (removes low frequencies) |
| **High Cut** | 1000–20000 Hz | 18500 Hz | Low-pass filter (removes high frequencies) |

### Compressor

| Control | Range | Default | Unit | Description |
|---|---|---|---|---|
| **Threshold** | -40–0 | -12 | dB | Compression threshold |
| **Ratio** | 1–20 | 4 | — | Compression ratio |
| **Attack** | 0–1 | 0.005 | s | Response speed |
| **Release** | 0–1 | 0.15 | s | Recovery speed |
| **Knee** | 0–40 | 30 | dB | Curve softness |

### Spectrum Analyzer

A real-time frequency spectrum display updated via `requestAnimationFrame`. Bars are colored from dark (low amplitude) to red (high amplitude).

---

## 8. Synth Editor

The Synth Editor is a full-screen overlay for editing soft synthesizer parameters. It opens from the Track Editor's "Edit" button when a generated sound is selected.

**Header:** OK (saves changes) / Cancel (reverts) buttons.

### Master Volume

| Parameter | Range | Default | Description |
|---|---|---|---|
| **masterVolume** | 0–1 | 0.8 | Synth output volume |
| **slide** | 0–500 | 0 | Portamento/glide time |

### Oscillators (VCO1, VCO2, VCO3)

Each oscillator has:

| Parameter | Range | Default | Description |
|---|---|---|---|
| **gain** | 0–1 | vco1:1, others:0 | Oscillator volume |
| **octave** | -4 to 4 | 0 | Octave offset |
| **detune** | -100 to 100 | 0 | Fine detuning in cents |
| **wave** | square, sawtooth, triangle, sine | sine | Waveform |

### Filter

| Parameter | Range | Default | Description |
|---|---|---|---|
| **type** | lowpass, highpass, bandpass, etc. | lowpass | Filter type |
| **freq** | 20–20000 | 400 Hz | Cutoff frequency |
| **Q** | 0.1–24 | 1 | Resonance |
| **envAmount** | 0–1 | 0 | Envelope modulation depth |

### LFO

| Parameter | Options/Range | Default | Description |
|---|---|---|---|
| **target** | NOT, filter.freq, vco1.detune, etc. | NOT | Modulation target |
| **wave** | square, sawtooth, triangle, sine | sine | LFO waveform |
| **freq** | 0–20 | 0 | LFO rate |
| **depth** | 0–1 | 0 | Modulation depth |

### Noise

| Parameter | Range | Default | Description |
|---|---|---|---|
| **mix** | 0–1 | 0 | White noise level |
| **filterType** | filter types | highpass | Noise filter type |
| **filterFreq** | 20–20000 | 1000 Hz | Noise filter cutoff |
| **filterQ** | 0.1–24 | 1 | Noise filter resonance |

### Envelope (ADSR)

| Parameter | Range | Default | Description |
|---|---|---|---|
| **attack** | 0–2 s | 0 | Attack time |
| **decay** | 0–2 s | 0.12 | Decay time |
| **sustain** | 0–1 | 1 | Sustain level |
| **release** | 0–3 s | 0.05 | Release time |

---

## 9. Keyboard Shortcuts

| Key | Action |
|---|---|
| **Space** | Start/Stop playback |
| **P** | Log patterns (legacy CSV format) |
| **B** | Auto-generate a new pattern |
| **S** | Log patterns as JSON to console |
| **F** | Switch to a random pattern |
| **G** | Switch to a random drumkit |
| **H** | Convert all tracks to soft-synth sounds |
| **1–9** | Toggle mute for tracks 1–9 |
| **Q, W, E, R, T, Y, U, I** | Preview (audition) tracks 0–7 |
| **Left/Right arrows** | Adjust focused slider by one step |

---

## 10. Audio Signal Flow

### Per-Track Signal Chain

```
Sample/Synth → Filter → Saturation → Dry Gain → Reverb → Delay → Output
                                                                      ↓
                                                              Stereo Panner
                                                                      ↓
                                                            Mixer Compressor
                                                                      ↓
                                                          Master Low-cut Filter
                                                                      ↓
                                                          Master High-cut Filter
                                                                      ↓
                                                            Master Gain → Analyser → Speakers
```

### Global Signal Chain

All tracks feed into a shared compressor, then through master filters and gain before reaching the output.
