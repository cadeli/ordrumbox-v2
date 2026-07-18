export default class BaseVoice {
    static _activeNodeCount = 0
    static get activeNodeCount() { return BaseVoice._activeNodeCount }

    constructor(audioCtx, strip, nodePool = null) {
        this.audioCtx = audioCtx
        this.strip = strip
        this.nodePool = nodePool
        this.stopped = false
        this.nodes = []
        this._pooledNodes = []
    }

    setup(flatNote, time) {
        throw new Error("setup() must be implemented by subclass")
    }

    start(time) {
        throw new Error("start() must be implemented by subclass")
    }

    stop(time) {
        this.stopped = true
    }

    cleanup = () => {
        const count = this.nodes.length
        this.nodes.forEach(node => {
            try { node.disconnect() } catch (e) {}
        })
        if (this.nodePool) {
            for (const node of this._pooledNodes) {
                this.nodePool.release(node)
            }
        }
        this._pooledNodes.length = 0
        this.nodes.length = 0
        BaseVoice._activeNodeCount = Math.max(0, BaseVoice._activeNodeCount - count)
    }

    registerNode(node) {
        this.nodes.push(node)
        BaseVoice._activeNodeCount++
        return node
    }

    acquireNode(type) {
        if (this.nodePool) {
            const node = this.nodePool.acquire(type)
            this._pooledNodes.push(node)
            this.nodes.push(node)
            BaseVoice._activeNodeCount++
            return node
        }
        return this.registerNode(this._createNode(type))
    }

    _createNode(type) {
        switch (type) {
            case 'GainNode':          return this.audioCtx.createGain()
            case 'BiquadFilterNode':  return this.audioCtx.createBiquadFilter()
            case 'StereoPannerNode':  return this.audioCtx.createStereoPanner()
            default: throw new Error(`BaseVoice: unsupported node type "${type}"`)
        }
    }

    connectToStripInput(sourceNode) {
        if (!sourceNode || !this.strip) return
        const entry = this.strip.voicesInput ?? this.strip.filter1
        sourceNode.connect(entry)
    }
}
