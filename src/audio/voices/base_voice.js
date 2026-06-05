export default class BaseVoice {
    constructor(audioCtx, strip) {
        this.audioCtx = audioCtx
        this.strip = strip
        this.stopped = false
        this.nodes = [] // Track nodes for cleanup
    }

    // To be implemented by subclasses
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
        this.nodes.forEach(node => {
            try {
                node.disconnect()
            } catch (e) {
                // Ignore disconnect errors
            }
        })
        this.nodes = []
    }

    registerNode(node) {
        this.nodes.push(node)
        return node
    }

    connectToStripInput(sourceNode) {
        if (!sourceNode || !this.strip) return
        const entry = this.strip.voicesInput ?? this.strip.filter1
        sourceNode.connect(entry)
    }
}
