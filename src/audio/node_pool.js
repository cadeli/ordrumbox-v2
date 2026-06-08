const DISPOSABLE = new Set(['OscillatorNode', 'BufferSourceNode'])

export default class NodePool {
    constructor(audioCtx) {
        this.audioCtx = audioCtx
        this._pools = {}
    }

    acquire(type) {
        let pool = this._pools[type]
        if (!pool) pool = this._pools[type] = []
        const node = pool.pop() ?? this._create(type)
        return node
    }

    release(node) {
        if (!node) return
        try { node.disconnect() } catch (_) { /* already disconnected */ }
        const type = node.constructor.name
        if (DISPOSABLE.has(type)) return
        let pool = this._pools[type]
        if (!pool) pool = this._pools[type] = []
        pool.push(node)
    }

    _create(type) {
        switch (type) {
            case 'GainNode':          return this.audioCtx.createGain()
            case 'BiquadFilterNode':  return this.audioCtx.createBiquadFilter()
            case 'StereoPannerNode':  return this.audioCtx.createStereoPanner()
            case 'OscillatorNode':    return this.audioCtx.createOscillator()
            case 'BufferSourceNode':  return this.audioCtx.createBufferSource()
            default: throw new Error(`NodePool: unsupported node type "${type}"`)
        }
    }
}
