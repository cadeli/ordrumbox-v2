import MfResourcesLoader from './mfresourcesloader.js'

export default class MfLoader {
    static TAG = "MFLOADER"
    constructor(completeLoaded,patternLoaded) {
        this.completeLoaded = completeLoaded
        this.patternLoaded=patternLoaded

        this.soundLoaded = false
        this.patterns1Loaded = false
        this.patterns2Loaded = false
        this.serializdPatternsLoaded = false
        this.scalesLoaded = false
        this.trackLibLoaded = false
        this.generatedSoundsLoaded = false
        this.minimalDrumkitLoaded = false
        this.extendedSoundsLoaded = false
        this.loadAllResources()
    }

    loadAllResources = () => {
        const mfResourcesLoader = new MfResourcesLoader()
        mfResourcesLoader.loadPatterns("./assets/patterns.json", this.onPatterns1Loaded)
        mfResourcesLoader.loadTrackLib("./assets/tracklib.json", this.onTrackLibLoaded)
        mfResourcesLoader.loadScales("./assets/scales.json", this.onScalesLoaded)
        mfResourcesLoader.loadGeneratedSounds("./assets/generated_sounds.json", this.onGeneratedSoundsLoaded)
     }


    loadMinimalKit= () => {
        const mfResourcesLoader = new MfResourcesLoader()
        mfResourcesLoader.loadSamples("./assets/minimalkit.json", this.onMinimalDrumkitLoaded, this.onSoundsProgress)
    }


    loadExtendedDrumkits = (displayModalDrumkit) => {
        if (this.extendedSoundsLoaded===true) {
            document.getElementById("resourcesProgress").style.display = 'none'
            return
        }
        const mfResourcesLoader = new MfResourcesLoader()
        this.completeLoaded=displayModalDrumkit
        mfResourcesLoader.loadSamples("./assets/djtkits.json", this.onExtendedSoundsLoaded, this.onSoundsProgress)
    }

    onExtendedSoundsLoaded = () => {//TODO refactor
        this.extendedSoundsLoaded=true
        document.getElementById("resourcesProgress").style.display = 'none'
        this.completeLoaded()
    }

    onAllResourceLoad = () => {   // TODO refactor
        console.log("onAllResourceLoad === "+
            "\npatterns1Loaded="+this.patterns1Loaded+
            "\nscalesLoaded="+this.scalesLoaded +
            "\ntracklibLoaded="+this.trackLibLoaded +
            "\ngeneratedSoundsLoaded="+this.generatedSoundsLoaded +
            "\nminimalDrumkitLoaded="+this.minimalDrumkitLoaded+
            "\nextendedSoundsLoaded="+this.extendedSoundsLoaded+
            "\n==="

            )
        if (
            this.patterns1Loaded === true &&
            this.scalesLoaded === true &&
            this.trackLibLoaded === true &&
            this.generatedSoundsLoaded === true &&
            this.minimalDrumkitLoaded === true 
        ) {
            console.log(MfGlobals.patterns)
            console.log(MfGlobals.scales)
            console.log(MfGlobals.generatedSounds)
            console.log(MfGlobals.drumkits)
            console.log(MfGlobals.sounds)
            console.log(MfGlobals.trackLib)
            document.getElementById("resourcesProgress").style.display = 'none'
            this.completeLoaded()
        }
    }

     onMinimalDrumkitLoaded = () => {
        this.minimalDrumkitLoaded = true
        this.onAllResourceLoad()
    }

    onPatterns1Loaded = () => {
        this.patterns1Loaded = true
        this.onAllResourceLoad()
        if (this.patternLoaded) {
            this.patternLoaded()
        }
    }

    onPatterns2Loaded = () => {
        this.patterns2Loaded = true
        this.onAllResourceLoad()
    }

    onSerializdPatternsLoaded = () => {
        this.serializdPatternsLoaded = true
        this.onAllResourceLoad()
    }

    onScalesLoaded = () => {
        this.scalesLoaded = true
        this.onAllResourceLoad()
    }

    onGeneratedSoundsLoaded = () => {
        this.generatedSoundsLoaded = true
        this.onAllResourceLoad()
    }

    onMinimalDrumkitLoaded = () => {
        this.minimalDrumkitLoaded = true
        this.onAllResourceLoad()
    }

    onTrackLibLoaded = () => {
        this.trackLibLoaded = true
        this.onAllResourceLoad()
    }   

    onSoundsProgress = (progress) => {
        document.getElementById("resourcesProgressBar").value = progress
    }
}