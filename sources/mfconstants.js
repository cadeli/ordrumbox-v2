let MfGlobals = {
    sounds: [],
    scales: {},
    generatedSounds :{},
    patterns:[],
    drumkits:{},
    leds:{},
    blob:null,
    audioCtx: null,
    secondsPerBeat:8,  //i.e BPM
    selectedDrumkit: "real",
    selectedPatternNum: 0,
    selectedTrackNum:0,
    selectedLfo:"pitchLfo",
    displayBars:1, //current displayBar
    mfPatterns:null,  // can compute flatnotes
    mfUpdates:null,  // mvc (v)
    mfMixer:null,
    TICK : 32,  // bar internal division
    autoMode:false,  // bass generation
    textInput:false     //beurk TODO
}