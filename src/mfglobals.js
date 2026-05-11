export const MfGlobals = {
  urlkits: "public/assets/kits/",
  urlscales: "public/assets/data/scales.json",
  urldrumkits: "public/assets/data/drumkits.json",
  urlpatterns: "public/assets/data/patterns.json",
  urlgeneratedsounds: "public/assets/data/generated_sounds.json",
  sounds: {},
  scales: {},
  generatedSounds: {},
  patterns: [],
  drumkitList: [],
  drumkits: {},
  leds: {},
  blob: null,
  audioCtx: null,
  secondsPerBeat: 8,  //i.e BPM
  selectedDrumkit: "real",
  selectedDrumkitNum: 0,
  selectedPatternNum: 0,
  selectedTrackNum: 0,
  selectedLfo: "pitchLfo",
  displayBars: 1, //current displayBar
  mfCmd: null,
  mfPatterns: null,  // can compute flatnotes
  mfUpdates: null,  // mvc (v)
  midiManager: null,
  mfMixer: null,
  TICK: 32,  // bar internal division
  autoMode: false,  // bass generation
  textInput: false     //beurk TODO
}
