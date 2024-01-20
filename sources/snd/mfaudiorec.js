export default class MfAudioRec { // original code from https://github.com/higuma
    static TAG = "MFAUDIOREC"

    constructor(sourceNode) {
        this.buffer = []
        this.workerFile = "recorderworker.js"
        this.timeLimit = 320 // recording time limit (sec)
        this.numChannels = 2
        this.bufferSize = undefined
        this.context = sourceNode.context
        if (this.context.createScriptProcessor == null) {
            this.context.createScriptProcessor = this.context.createJavaScriptNode
        }
        this.input = this.context.createGain()
        sourceNode.connect(this.input)
        this.initWorker()
    }

    isRecording = () => { return this.processor != null; }


    startRecording = () => {
        if (this.isRecording()) {
            console.error("MfAudioRec::startRecording: previous recording is running")
            return
        }

        this.processor = this.context.createScriptProcessor(this.bufferSize, this.numChannels, this.numChannels);
        this.input.connect(this.processor);
        this.processor.connect(this.context.destination)
        let _this = this
        this.processor.onaudioprocess = function(event) {
            for (let ch = 0; ch < _this.numChannels; ++ch) {
                _this.buffer[ch] = event.inputBuffer.getChannelData(ch)
            }
            _this.worker.postMessage({ command: "record", buffer: _this.buffer })
        }
        this.worker.postMessage({
            command: "start",
            bufferSize: this.processor.bufferSize
        });
        this.startTime = Date.now()
    }

    recordingTime = () => {
        return this.isRecording() ? (Date.now() - this.startTime) * 0.001 : null
    }

    cancelRecording = () => {
        if (this.isRecording()) {
            this.input.disconnect()
            this.processor.disconnect()
            delete this.processor
            this.worker.postMessage({ command: "cancel" })
        } else
            console.error("MfAudioRec::cancelRecording: no recording is running")
    }

    finishRecording = () => {
        if (this.isRecording()) {
            console.log("mfAudioRec::finishRecording isRecording = true")
            this.input.disconnect()
            this.processor.disconnect()
            delete this.processor
            this.worker.postMessage({ command: "finish" })
        } else
            console.error("MfAudioRec::finishRecording: no recording is running")
    }

    initWorker = () => {
        console.log("mfAudioRec::initWorker")
        if (this.worker != null) {
            this.worker.terminate()
        }
        this.onEncoderLoading(this, this.encoding)
        this.worker = new Worker(this.workerFile)
        let _this = this
        this.worker.onmessage = function(event) {
            let data = event.data;
            switch (data.command) {
                case "loaded":
                    _this.onEncoderLoaded(_this, _this.encoding)
                    break;
                case "timeout":
                    _this.onTimeout(_this)
                    break;
                case "progress":
                    _this.onEncodingProgress(_this, data.progress)
                    break;
                case "complete":
                    _this.onComplete(_this, data.blob)
                    break;
            }
        }
        this.worker.postMessage({
            command: "init",
            config: {
                sampleRate: this.context.sampleRate,
                numChannels: this.numChannels,
                timeLimit: this.timeLimit,
                bufferSize: this.bufferSize,
            },
        })
    }

    onEncoderLoading = (recorder, encoding) => {}
    onEncoderLoaded = (recorder, encoding) => {}
    onEncodingProgress = (recorder, progress) => {}
    onEncodingCanceled = (recorder) => {}
    onComplete = (recorder, blob) => {}
    onTimeout = (recorder) => {recorder.finishRecording()}
}