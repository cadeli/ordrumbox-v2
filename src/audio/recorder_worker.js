class MfWebEncode { // original code from https://github.com/higuma
    static TAG = "MFWEBENCODE"

    constructor(sampleRate, numChannels) {
        this.sampleRate = sampleRate
        this.numChannels = numChannels
        this.numSamples = 0
        this.dataViews = []
    }

    encode = (buffer) => {
        let len = buffer[0].length
        let nCh = this.numChannels
        let view = new DataView(new ArrayBuffer(len * nCh * 2))
        let offset = 0
        for (let i = 0; i < len; ++i) {
            for (let ch = 0; ch < nCh; ++ch) {
                let x = buffer[ch][i] * 0x7fff
                view.setInt16(offset, x < 0 ? Math.max(x, -0x8000) : Math.min(x, 0x7fff), true)
                offset += 2
            }
        }
        this.dataViews.push(view)
        this.numSamples += len
    }

    finish = (mimeType) => {
        let dataSize = this.numChannels * this.numSamples * 2
        
        let view = new DataView(new ArrayBuffer(44))
        this.setString(view, 0, 'RIFF')
        view.setUint32(4, 36 + dataSize, true)
        this.setString(view, 8, 'WAVE')
        this.setString(view, 12, 'fmt ')
        view.setUint32(16, 16, true)
        view.setUint16(20, 1, true)
        view.setUint16(22, this.numChannels, true)
        view.setUint32(24, this.sampleRate, true)
        view.setUint32(28, this.sampleRate * 4, true)
        view.setUint16(32, this.numChannels * 2, true)
        view.setUint16(34, 16, true)
        this.setString(view, 36, 'data')
        view.setUint32(40, dataSize, true)

/*        
        let view = new DataView(new ArrayBuffer(44+36))
        this.setString(view, 0, 'RIFF')
        view.setUint32(4, 36+36 + dataSize, true)
        this.setString(view, 8, 'WAVE')
        this.setString(view, 12, 'fmt ')
        view.setUint32(16, 16, true)
        view.setUint16(20, 1, true)
        view.setUint16(22, this.numChannels, true)
        view.setUint32(24, this.sampleRate, true)
        view.setUint32(28, this.sampleRate * 4, true)
        view.setUint16(32, this.numChannels * 2, true)
        view.setUint16(34, 16, true)
        let offset=36
        this.setString(view, 0+offset, "LIST")
        view.setUint32(4+offset, 28, true)
        this.setString(view, 8+offset, "INFO")
        this.setString(view, 12+offset, "ISFT")
        view.setUint32(16+offset, 16, true)
        this.setString(view,20+offset, "online-ordrumbox")

        this.setString(view, 36+36, 'data')
        view.setUint32(40+36, dataSize, true)
*/
        this.dataViews.unshift(view)


        let blob = new Blob(this.dataViews, { type: 'audio/wav' })
        this.cleanup()

        return blob
    }

    cancel = () => {
        delete this.dataViews
    }

    cleanup = () => {
        delete this.dataViews
    }

    setString = (view, offset, str) => {
        for (let i = 0; i < str.length; ++i) {
            view.setUint8(offset + i, str.charCodeAt(i))
        }
    }

} //end of MfWebEncode class

let sampleRate = 44100
let numChannels = 2
let timeLimit = 320
let mimeType = "audio/wav"
let progressInterval = 1000
let bufferCount = 0
let bufferSize = undefined
let maxBuffers = undefined
let encoder = undefined
let recBuffers = undefined

function init(data) {
    console.log("recorderworker::init ")
    console.log(data)
    sampleRate = data.config.sampleRate
    numChannels = data.config.numChannels
    timeLimit = data.config.timeLimit
    bufferSize = data.config.bufferSize
}

function start(bufferSize) {
    maxBuffers = Math.ceil(timeLimit * sampleRate / bufferSize)
    recBuffers = []
}

function record(buffer) {
    if (!buffer) {
        console.error("recorderworker::record  no buffer ")
        
        return
    }
    if (!recBuffers) {
        console.error("recorderworker::record  no recBuffers ")
       
        return
    }
    if (bufferCount++ < maxBuffers) {
        if (encoder) {
            encoder.encode(buffer)
        } else {
            recBuffers.push(buffer)
        }
    } else {
        self.postMessage({ command: "timeout" })
    }
}

function postProgress(progress) {
    self.postMessage({ command: "progress", progress: progress })
}

function finish() {
    if (recBuffers) {
        postProgress(0);
        encoder = new MfWebEncode(sampleRate, numChannels)
        let timeout = Date.now() + progressInterval
        while (recBuffers.length > 0) {
            encoder.encode(recBuffers.shift())
            let now = Date.now()
            if (now > timeout) {
                postProgress((bufferCount - recBuffers.length) / bufferCount)
                timeout = now + options.progressInterval
            }
        }
        postProgress(1);
    }
    self.postMessage({
        command: "complete",
        blob: encoder.finish(mimeType)
    });
    cleanup();
}

function cleanup() {
    encoder = recBuffers = undefined
    bufferCount = 0
}

self.onmessage = function(event) {
    let data = event.data;
    switch (data.command) {
        case "init":
            init(data)
            break
        case "start":
            start(data.bufferSize)
            break
        case "record":
            record(data.buffer)
            break
        case "finish":
            finish()
            break
        case "cancel":
            cleanup()
    }
}

self.postMessage({ command: "loaded" })