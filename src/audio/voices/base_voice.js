export default class BaseVoice {
    static #activeNodeCount = 0
    static get activeNodeCount() {
        return BaseVoice.#activeNodeCount
    }

    #pooledNodes

    /**
     * Chained by Sound (sound.js: registerSynthVoice and the play path) so
     * polyphony and node cleanup run when the voice ends. Sound assigns it to
     * EVERY voice it creates, so the `if (this.onEnded)` guards downstream only
     * matter for voices constructed directly, i.e. in tests.
     */
    onEnded

    /**
     * @param {BaseAudioContext} audioCtx
     * @param {any} strip
     * @param {any} [nodePool]
     */
    constructor(audioCtx, strip, nodePool = null) {
        this.audioCtx = audioCtx
        this.strip = strip
        this.nodePool = nodePool
        this.stopped = false
        this.nodes = []
        this.#pooledNodes = []
    }

    /** @param {any} _flatNote @param {number} _time */
    setup(_flatNote, _time) {
        throw new Error('setup() must be implemented by subclass')
    }

    /** @param {number} _time */
    start(_time) {
        throw new Error('start() must be implemented by subclass')
    }

    /** @param {number} _time */
    stop(_time) {
        this.stopped = true
    }

    /** @returns {void} */
    cleanup() {
        const count = this.nodes.length
        this.nodes.forEach((node) => {
            try {
                node.disconnect()
            } catch {
                /* no-op */
            }
        })
        if (this.nodePool) {
            for (const node of this.#pooledNodes) {
                this.nodePool.release(node)
            }
        }
        this.#pooledNodes.length = 0
        this.nodes.length = 0
        BaseVoice.#activeNodeCount = Math.max(0, BaseVoice.#activeNodeCount - count)
    }

    /** @param {any} node @returns {any} */
    registerNode(node) {
        this.nodes.push(node)
        BaseVoice.#activeNodeCount++
        return node
    }

    /** @param {any} type @returns {any} */
    acquireNode(type) {
        if (this.nodePool) {
            const node = this.nodePool.acquire(type)
            this.#pooledNodes.push(node)
            this.nodes.push(node)
            BaseVoice.#activeNodeCount++
            return node
        }
        return this.registerNode(this.#createNode(type))
    }

    #createNode(type) {
        switch (type) {
            case 'GainNode':
                return this.audioCtx.createGain()
            case 'BiquadFilterNode':
                return this.audioCtx.createBiquadFilter()
            case 'StereoPannerNode':
                return this.audioCtx.createStereoPanner()
            default:
                throw new Error(`BaseVoice: unsupported node type "${type}"`)
        }
    }

    /** @param {any} sourceNode */
    connectToStripInput(sourceNode) {
        if (!sourceNode || !this.strip) return
        const entry = this.strip.voicesInput ?? this.strip.filter1
        sourceNode.connect(entry)
    }
}
