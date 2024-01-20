export default class WaveVisu {
    static TAG = "WAVEVISU"

    constructor() {
        this.animations = []
        this.anims = {}
        this.bands = []
        this.palette = [
            '#256b26',
            '#f2c800',
            '#de2901',
            '#b686b0',
            '#b8cedb',
            '#1f547e',
            '#ffc9ca',
            '#2e6135',
            '#eee801',
            '#1c16A8',
            '#fdce98',
            '#fad295',
            '#6e0202'
        ]

    }

    displayLeds = () => {
        const hh = document.getElementById('trackBtn_0').getBoundingClientRect().height
        const tracks = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks
        tracks.forEach((track, indexTrack) => {
            const ledDom = document.getElementById('trackLed_' + indexTrack)
            if (ledDom && MfGlobals.leds[track.name]) {
                if (MfGlobals.leds[track.name] > 0) {
                    MfGlobals.leds[track.name]--
                    ledDom.setAttribute("r", eval(MfGlobals.leds[track.name]) * 20)
                } else {
                    ledDom.setAttribute("r", 1)
                }
            }
        })
    }

    drawWaveform = () => {
        if (!MfGlobals.mfMixer.analyser) { return }
        const svg = document.getElementById('waveformSvg')
        const bufferLength = MfGlobals.mfMixer.analyser.fftSize
        MfGlobals.mfMixer.analyser.getByteTimeDomainData(MfGlobals.mfMixer.dataArray);
        while (svg.firstChild) {
            svg.firstChild.remove();
        }
        let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke', '#FFF')
        path.setAttribute('stroke-width', '4')
        let d = `M0 ${svg.height.baseVal.value / 2}`
        let sliceWidth = svg.width.baseVal.value * 1.0 / bufferLength
        let x = 0
        for (let i = 0; i < bufferLength; i++) {
            const v =  MfGlobals.mfMixer.dataArray[i] / (128.0)
            const y = v * svg.height.baseVal.value / 2
            d += ` L${x} ${y}`
            x += sliceWidth
        }
        path.setAttribute('d', d)
        svg.appendChild(path)
    }

    displaySpectrum = () => {
        if (!MfGlobals.mfMixer.analyser) { return }
        MfGlobals.mfMixer.analyser.getByteFrequencyData(MfGlobals.mfMixer.gFftData)
        const svg = document.getElementById('vuMetterBorderSvg');
        while (svg.firstChild) { svg.firstChild.remove() }
        let nbBands = 16
        let bufferLength = MfGlobals.mfMixer.gFftData.length
        let barWidth = svg.width.baseVal.value * nbBands / bufferLength;
        let x = 0;
        for (let i = nbBands; i < bufferLength; i += nbBands) {
            const barHeight = (MfGlobals.mfMixer.gFftData[i] / 256) * svg.height.baseVal.value
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
            rect.setAttribute('x', x)
            rect.setAttribute('y', svg.height.baseVal.value - barHeight)
            rect.setAttribute('width', barWidth)
            rect.setAttribute('height', barHeight)
            rect.setAttribute('fill', '#FFF')
            svg.appendChild(rect);
            x += barWidth;
        }
    }

    // Create an animation element
    createAnimation = (svg, x, y, width, height, index) => {
        const animation = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        animation.setAttribute('x', x)
        animation.setAttribute('y', y)
        animation.setAttribute('width', width)
        animation.setAttribute('fill', this.palette[index % this.palette.length])
        animation.setAttribute('height', height)
        // animation.setAttribute('stroke', this.palette[index%this.palette.length])
        // animation.setAttribute('stroke-width', '20')
        svg.appendChild(animation)

        return animation
    }

    drawWaveformAlt2 = () => {
        if (document.getElementById("visu-modal").style.display === "none") return
        const svg = document.getElementById('visuformSvg')
        const tracks = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks
        const svgWidth = svg.clientWidth
        const svgHeight = svg.clientHeight
        if (svgWidth < 1) { return }
        const barWidth = (svgWidth) / tracks.length
        tracks.forEach((track, indexTrack) => {
            if (!MfGlobals.leds[track.name]) { return }
            let barHeight = MfGlobals.leds[track.name] * svgHeight / 20
            if (!this.anims[track.name]) {
                const anim = this.createAnimation(svg,
                    svgWidth * (indexTrack / tracks.length),
                    svgHeight,
                    barWidth,
                    barHeight,
                    indexTrack);
                this.anims[track.name] = anim
            } else {
                const anim = this.anims[track.name]

                anim.setAttribute('height', barHeight)
                anim.setAttribute('y', (svgHeight - barHeight))
                anim.setAttribute('stroke', "#FFF");
                // console.log(animation)
            }
        })
    }



    drawWaveformAlt = () => {
        if (!MfGlobals.mfMixer.analyser) { return }
        if (document.getElementById("visu-modal").style.display === "none") return
        const svg = document.getElementById('visuformSvg')
        const bufferLength = MfGlobals.mfMixer.analyser.fftSize / 2
        MfGlobals.mfMixer.analyser.getByteFrequencyData(MfGlobals.mfMixer.dataArray);
        const svgWidth = svg.clientWidth
        const svgHeight = svg.clientHeight
        if (svgWidth < 1) { return }
        let x = 0;
        const nbBands = 16
        const barWidth = (svgWidth * nbBands) / bufferLength
        for (let i = 0; i < bufferLength; i += nbBands) {
            let barHeight = MfGlobals.mfMixer.dataArray[i] * 2;

            if (!this.animations[i]) {
                const animation = this.createAnimation(svg,
                    svgWidth * (i / bufferLength),
                    svgHeight,
                    barWidth,
                    barHeight,
                    i);
                this.animations[i] = animation;
            } else {
                const animation = this.animations[i]
                const step = 16
                if ((parseFloat(animation.getAttribute('height')) - barHeight) > step) {
                    barHeight = parseFloat(animation.getAttribute('height')) - step
                } else if ((parseFloat(animation.getAttribute('height')) - barHeight) < step) {
                    barHeight = parseFloat(animation.getAttribute('height')) + step
                }
                animation.setAttribute('height', barHeight)
                animation.setAttribute('y', (svgHeight - barHeight))
                animation.setAttribute('stroke-width', barWidth / 10)
                animation.setAttribute('stroke', '#FFF');
                // console.log(animation)
            }
            x++;
        }
    }
}