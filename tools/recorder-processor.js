// tools/recorder-processor.js
// AudioWorkletProcessor that records PCM samples from the audio graph.
// Sends accumulated chunks to the main thread via port.postMessage().
// Each message: { type: 'chunk', samples: Float32Array, sampleRate: number }
// On stop: { type: 'done', totalSamples: number }

class RecorderProcessor extends AudioWorkletProcessor {
    #buffer
    #writePos = 0
    #chunkSize

    constructor(options) {
        super()
        this.#chunkSize = options.processorOptions?.chunkSize ?? 16384
        this.#buffer = new Float32Array(this.#chunkSize)
        this.port.onmessage = (e) => {
            if (e.data?.type === 'stop') this.#flush()
        }
    }

    process(inputs) {
        const input = inputs[0]
        if (!input || input.length === 0) return true
        const channelData = input[0]
        if (!channelData || channelData.length === 0) return true

        for (let i = 0; i < channelData.length; i++) {
            this.#buffer[this.#writePos++] = channelData[i]
            if (this.#writePos >= this.#chunkSize) {
                this.#flush()
            }
        }
        return true
    }

    #flush() {
        if (this.#writePos > 0) {
            const chunk = new Float32Array(this.#writePos)
            chunk.set(this.#buffer.subarray(0, this.#writePos))
            this.port.postMessage({ type: 'chunk', samples: chunk, sampleRate: sampleRate })
            this.#writePos = 0
        }
    }
}

registerProcessor('recorder-processor', RecorderProcessor)
