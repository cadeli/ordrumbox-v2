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
        this.resetNode(node, type)
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

    resetNode(node, type) {
        if (!node) return
        try { node.disconnect() } catch (_) {}

        try {
            switch (type) {
                case 'GainNode':
                    if (node.gain?.cancelScheduledValues) node.gain.cancelScheduledValues(0)
                    if (node.gain) node.gain.value = 1
                    break
                case 'BiquadFilterNode':
                    if (node.frequency?.cancelScheduledValues) node.frequency.cancelScheduledValues(0)
                    if (node.Q?.cancelScheduledValues) node.Q.cancelScheduledValues(0)
                    if (node.frequency) node.frequency.value = 350
                    if (node.Q) node.Q.value = 1
                    node.type = 'lowpass'
                    break
                case 'StereoPannerNode':
                    if (node.pan?.cancelScheduledValues) node.pan.cancelScheduledValues(0)
                    if (node.pan) node.pan.value = 0
                    break
            }
        } catch (_) {}
    }

    get stats() {
        const result = {}
        for (const [type, pool] of Object.entries(this._pools)) {
            result[type] = pool.length
        }
        return result
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
