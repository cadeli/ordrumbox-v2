import { MfGlobals } from '../mfglobals.js'
import Utils from '../utils.js'

export default class MfSound {
    static lastPitch = undefined;

    constructor() {
        this.activeVoices = new WeakMap()
        this.generatedSoundsLoading = false
        this.generatedSoundsLoadFailed = false
    }

    init = () => { }

    getStrip = (track, callerTag = "mfsound") => {
        const strip = MfGlobals.mfMixer.strips[track?.name];
        if (!strip) {
            console.warn(`${callerTag} - No strip for: ${track?.name}`)
            return null
        }
        return strip
    }

    applyStripSettings = (strip, {
        filterType,
        filterFreq,
        filterQ,
        saturationType,
        saturationAmount,
        reverbType,
        reverbAmount,
        trackVelo,
        time
    }) => {
        if (!strip) return

        if (filterType !== undefined) {
            strip.updateFilter(filterType, filterFreq, filterQ)
        }

        if (saturationType !== undefined || saturationAmount !== undefined) {
            strip.updateSaturation(saturationType, saturationAmount)
        }

        if (reverbType !== undefined || reverbAmount !== undefined) {
            strip.updateReverb(reverbType, reverbAmount)
        }

        if (trackVelo !== undefined && time !== undefined) {
            strip.output.gain.setTargetAtTime(trackVelo, time, 0.01)
        }
    }

    connectToStripInput = (sourceNode, strip) => {
        if (!sourceNode || !strip) return
        sourceNode.connect(strip.filter1)
    }

    stopVoice = (voice, time) => {
        if (!voice || typeof voice.stop !== "function") return
        try {
            voice.stop(time)
        } catch (e) {
            console.warn("MfSound::stopVoice failed", e)
        }
    }

    stopPreviousVoice = (track, time) => {
        if (!track?.mono) return
        const previousVoice = this.activeVoices.get(track)
        if (previousVoice) {
            this.stopVoice(previousVoice, time)
            this.activeVoices.delete(track)
        }
    }

    registerVoice = (track, voice) => {
        if (!track?.mono || !voice) return
        this.activeVoices.set(track, voice)
    }

    play = (flatNote, time) => {
        if (!flatNote) return;
        if (MfGlobals.mfMixer.analyser) { //TODO 
            if (flatNote.track.useSoftSynth === true) {
                this.playGenerated(flatNote, time)
            } else {
                this.playSample(flatNote, time)
            }
        }
    }

    playSample = (flatNote, time) => { //gmi
        try {
            const ctx = MfGlobals.audioCtx;
            const track = flatNote.track;

            const strip = this.getStrip(track, "mfsound::playSample")
            if (!strip) return

            MfGlobals.leds[track.name] = 20;

            const snd = ctx.createBufferSource();
            const gainEnveloppe = ctx.createGain();
            const panNode = ctx.createStereoPanner();
            let stopped = false;

            let soundBuffer = MfGlobals.sounds[flatNote.soundId]?.buffer;
            if (!soundBuffer) {
                soundBuffer = MfGlobals.sounds[flatNote.track.soundId]?.buffer //fallback TODO
                if (!soundBuffer) {
                    console.warn(`mfsound::playSample - No soundBuffer for: ${track.name}  soundId:  ${flatNote.soundId} soundId track :  ${flatNote.track.soundId}`)
                    console.warn(flatNote.track)
                    return;
                }
            }
            snd.buffer = soundBuffer;

            this.stopPreviousVoice(track, time)


            snd.playbackRate.setTargetAtTime(flatNote.fpitch || 1, time, 0.001);
            panNode.pan.setValueAtTime(flatNote.pan ?? 0, time);

            this.applyStripSettings(strip, {
                filterType: track.filterType,
                filterFreq: track.filterFreq,
                filterQ: track.filterQ,
                saturationType: track.saturationType,
                saturationAmount: track.saturationAmount,
                reverbType: track.reverbType,
                reverbAmount: track.reverbAmount,
                trackVelo: (track.velocity * 16) ?? 16,
                time
            })

            const duration = (track.sampleLength || .5);
            const releaseTime = 0.05;
            const noteVelo = flatNote.note?.velocity ?? 1;

            gainEnveloppe.gain.setValueAtTime(0, time);
            gainEnveloppe.gain.linearRampToValueAtTime(noteVelo, time + 0.005);
            gainEnveloppe.gain.setValueAtTime(noteVelo, time + duration);
            gainEnveloppe.gain.exponentialRampToValueAtTime(0.001, time + duration + releaseTime);

            snd.connect(gainEnveloppe);
            gainEnveloppe.connect(panNode);

            this.connectToStripInput(panNode, strip)

            const stop = (stopTime = ctx.currentTime) => {
                if (stopped) return
                stopped = true
                try {
                    gainEnveloppe.gain.cancelScheduledValues(stopTime)
                    const currentGain = Math.max(0.001, gainEnveloppe.gain.value || noteVelo || 1)
                    gainEnveloppe.gain.setValueAtTime(currentGain, stopTime)
                    gainEnveloppe.gain.exponentialRampToValueAtTime(0.001, stopTime + 0.015)
                } catch (e) {
                    console.error(e)
                }
                try {
                    snd.stop(stopTime + 0.02)
                } catch (e) {
                    console.error(e)
                }
            }

            this.registerVoice(track, { stop })

            snd.start(time);
            snd.stop(time + duration + releaseTime);

            snd.onended = () => {
                snd.disconnect();
                gainEnveloppe.disconnect();
                panNode.disconnect();
                if (this.activeVoices.get(track)?.stop === stop) {
                    this.activeVoices.delete(track)
                }
            };

        } catch (e) {
            console.error("Error in playSample:", e);
        }
    }

    loadGeneratedsounds = (flatNote, time) => {
        if (this.generatedSoundsLoading || this.generatedSoundsLoadFailed) {
            return
        }

        this.generatedSoundsLoading = true
        MfGlobals.mfResourcesLoader.loadGeneratedSounds(MfGlobals.urlgeneratedsounds, () => {
            this.generatedSoundsLoading = false
            if (Object.keys(MfGlobals.generatedSounds).length === 0) {
                this.generatedSoundsLoadFailed = true
                console.warn("MfSounds::loadGeneratedsounds loaded no generated sounds")
                return
            }
            this.playGenerated(flatNote, time)
        }).catch((error) => {
            this.generatedSoundsLoading = false
            this.generatedSoundsLoadFailed = true
            console.error("MfSounds::loadGeneratedsounds failed", error)
        })
    }


    playGenerated = (flatNote, time) => {
        if (Object.keys(MfGlobals.generatedSounds).length === 0) {
            this.loadGeneratedsounds(flatNote, time)
            return
        }
        if (!flatNote) return
        const track = flatNote.track;
        const strip = this.getStrip(track, "mfsound::playGenerated")
        if (!strip) return
        const ctx = MfGlobals.audioCtx
        const generatedSound = MfGlobals.generatedSounds?.[flatNote?.track?.synthSoundKey || "BASS1"]
        if (!generatedSound) {
            return
        }

        /* ---------------- HELPERS ---------------- */

        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
        const C3_FREQ = 130.8127826502993;
        const toFiniteNumber = (value, fallback = 0) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : fallback;
        };
        const noteRatio = Math.max(0.0001, toFiniteNumber(flatNote.fpitch, 1));
        const noteVelo = flatNote.note?.velocity ?? 1;
        const env = generatedSound.enveloppe ?? { attack: 0, decay: 0, sustain: 1, release: 0 };

        /* ---------------- NODES ---------------- */

        const gainEnv = ctx.createGain();
        const panNode = ctx.createStereoPanner();

        const lfoGain = ctx.createGain();
        let stopped = false;

        /* ---------------- LFO ---------------- */

        const lfo = MfGlobals.mfMixer.lfo;

        lfo.type = typeof generatedSound.lfo?.wave === "string" ? generatedSound.lfo.wave : "sine";
        lfo.frequency.value = toFiniteNumber(generatedSound.lfo?.freq, 0) + 0.1;
        lfoGain.gain.value = 1000 * toFiniteNumber(generatedSound.lfo?.depth, 0);

        lfo.connect(lfoGain);

        /* ---------------- OSCILLATORS ---------------- */

        const setupOsc = (cfg) => {
            if (!cfg || toFiniteNumber(cfg.gain, 0) <= 0) return null;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            const oct = clamp(toFiniteNumber(cfg.octave, 0), -4, 4);
            const det = clamp(toFiniteNumber(cfg.detune, 0), -100, 100);
            const wave = typeof cfg.wave === "string" ? cfg.wave : "sine";
            const freq = C3_FREQ * noteRatio * Math.pow(2, oct + (det / 100));

            //console.log("setupOscCfg : pitchRatio:", noteRatio, " oct:", cfg.octave, " det:", cfg.detune, " wave:", wave, " gain:", cfg.gain)
            //console.log("setupOscFrq : freq:", freq)
            osc.frequency.value = freq;
            osc.detune.value = 0;
            osc.type = wave;

            gain.gain.value = toFiniteNumber(cfg.gain, 0);

            osc.connect(gain);
            gain.connect(panNode);

            return { osc, gain }
        }

        const v1 = setupOsc(generatedSound.vco1);
        const v2 = setupOsc(generatedSound.vco2);
        const v3 = setupOsc(generatedSound.vco3);
        const oscNodes = [v1, v2, v3].filter(Boolean);
        let cleanedUp = false;

        /* ---------------- SLIDE (Portamento) ---------------- */
        const slideTime = toFiniteNumber(generatedSound.slide, 0);

        const v1Oct = v1 ? clamp(toFiniteNumber(generatedSound.vco1?.octave, 0), -4, 4) : 0;
        const v2Oct = v2 ? clamp(toFiniteNumber(generatedSound.vco2?.octave, 0), -4, 4) : 0;
        const v3Oct = v3 ? clamp(toFiniteNumber(generatedSound.vco3?.octave, 0), -4, 4) : 0;
        const v1Det = v1 ? clamp(toFiniteNumber(generatedSound.vco1?.detune, 0), -100, 100) : 0;
        const v2Det = v2 ? clamp(toFiniteNumber(generatedSound.vco2?.detune, 0), -100, 100) : 0;
        const v3Det = v3 ? clamp(toFiniteNumber(generatedSound.vco3?.detune, 0), -100, 100) : 0;

        const currentPitch = noteRatio * C3_FREQ;
        const currentPitchV1 = noteRatio * C3_FREQ * Math.pow(2, v1Oct + (v1Det / 100));
        const currentPitchV2 = noteRatio * C3_FREQ * Math.pow(2, v2Oct + (v2Det / 100));
        const currentPitchV3 = noteRatio * C3_FREQ * Math.pow(2, v3Oct + (v3Det / 100));

        if (slideTime > 0 && MfSound.lastPitchV1 !== undefined) {
            const lastPitchV1 = MfSound.lastPitchV1;
            const lastPitchV2 = MfSound.lastPitchV2;
            const lastPitchV3 = MfSound.lastPitchV3;
            const glideTime = slideTime / 1000;

            if (v1) {
                v1.osc.frequency.setValueAtTime(lastPitchV1, time);
                v1.osc.frequency.linearRampToValueAtTime(currentPitchV1, time + glideTime);
            }
            if (v2) {
                v2.osc.frequency.setValueAtTime(lastPitchV2, time);
                v2.osc.frequency.linearRampToValueAtTime(currentPitchV2, time + glideTime);
            }
            if (v3) {
                v3.osc.frequency.setValueAtTime(lastPitchV3, time);
                v3.osc.frequency.linearRampToValueAtTime(currentPitchV3, time + glideTime);
            }
        } else {
            if (v1) v1.osc.frequency.setValueAtTime(currentPitchV1, time);
            if (v2) v2.osc.frequency.setValueAtTime(currentPitchV2, time);
            if (v3) v3.osc.frequency.setValueAtTime(currentPitchV3, time);
        }
        MfSound.lastPitchV1 = currentPitchV1;
        MfSound.lastPitchV2 = currentPitchV2;
        MfSound.lastPitchV3 = currentPitchV3;

        /* ---------------- ACCENT (based on note velocity, fixed at 0.5) ---------------- */
        const accentAmount = 0.5;
        const isAccented = noteVelo > 0.5;
        const accentMultiplier = isAccented ? 1 + (accentAmount * 0.5) : 1;
        const accentAttack = isAccented ? Math.min(0.001, env.attack) : env.attack;
        const accentFilterBoost = isAccented ? accentAmount * 2000 : 0;

        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;

            try { lfo.disconnect(lfoGain) } catch (e) { /* already disconnected */ }
            try { lfoGain.disconnect() } catch (e) { /* already disconnected */ }
            try { panNode.disconnect() } catch (e) { /* already disconnected */ }
            try { gainEnv.disconnect() } catch (e) { /* already disconnected */ }

            oscNodes.forEach(({ osc, gain }) => {
                try { osc.disconnect() } catch (e) { /* already disconnected */ }
                try { gain.disconnect() } catch (e) { /* already disconnected */ }
            });

            if (noiseNode) {
                try { noiseNode.disconnect() } catch (e) { /* already disconnected */ }
                try { noiseGain.disconnect() } catch (e) { /* already disconnected */ }
                try { noiseFilter.disconnect() } catch (e) { /* already disconnected */ }
            }
        };

        const stop = (stopTime = ctx.currentTime) => {
            if (stopped) return
            stopped = true
            try {
                gainEnv.gain.cancelScheduledValues(stopTime)
                const currentGain = Math.max(0.001, gainEnv.gain.value || noteVelo || 1)
                gainEnv.gain.setValueAtTime(currentGain, stopTime)
                gainEnv.gain.exponentialRampToValueAtTime(0.001, stopTime + 0.015)
            } catch (e) { /* gain already released or ctx closed */ }
            oscNodes.forEach(({ osc }) => {
                try { osc.stop(stopTime + 0.02) } catch (e) { /* already stopped */ }
            })
        };

        this.stopPreviousVoice(track, time)


        /* ---------------- PAN ---------------- */

        if (flatNote.pan !== undefined) {
            panNode.pan.value = flatNote.pan;
        }

        /* ---------------- FILTER 24dB ---------------- */

        const mFreq = Utils.normalizeSynthFilterFreqValue(toFiniteNumber(generatedSound.filter?.freq, 50) + accentFilterBoost);
        const mQ = Utils.normalizeSynthFilterQValue(toFiniteNumber(generatedSound.filter?.Q, 1));
        const filterEnvelopeAmount = Math.min(1, Math.max(0, toFiniteNumber(generatedSound.filter?.filterEnvelopeAmount, 0)));
        const peakFreq = Utils.normalizeSynthFilterFreqValue(
            mFreq + ((20000 - mFreq) * filterEnvelopeAmount)
        );
        const trackVelo = track.velocity / 2 ?? 0.5;

        this.applyStripSettings(strip, {
            filterType: generatedSound.filter?.type,
            filterFreq: mFreq,
            filterQ: mQ,
            saturationType: track.saturationType,
            saturationAmount: track.saturationAmount,
            reverbType: track.reverbType,
            reverbAmount: track.reverbAmount,
            trackVelo,
            time
        });

        [strip.filter1, strip.filter2].forEach((filterNode) => {
            if (!filterNode) return;
            filterNode.frequency.cancelScheduledValues(time);
            filterNode.frequency.setValueAtTime(mFreq, time);
            if (filterEnvelopeAmount > 0) {
                filterNode.frequency.linearRampToValueAtTime(peakFreq, time + env.attack);
                filterNode.frequency.linearRampToValueAtTime(mFreq, time + env.attack + env.decay);
            }
            filterNode.Q.setValueAtTime(mQ, time);
        });

        /* ---------------- NOISE (always enabled, mix with oscillators) ---------------- */
        const noiseConfig = generatedSound.noise ?? {};
        const noiseMix = toFiniteNumber(noiseConfig.mix, 0);

        let noiseNode = null;
        let noiseGain = null;
        let noiseFilter = null;

        if (noiseMix > 0) {
            const noiseBufferSize = ctx.sampleRate * 2;
            const noiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseBufferSize; i++) {
                noiseData[i] = Math.random() * 2 - 1;
            }

            noiseNode = ctx.createBufferSource();
            noiseNode.buffer = noiseBuffer;
            noiseNode.loop = true;

            noiseGain = ctx.createGain();
            noiseGain.gain.value = noiseMix;

            noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = typeof noiseConfig.filterType === "string" ? noiseConfig.filterType : "highpass";
            noiseFilter.frequency.value = toFiniteNumber(noiseConfig.filterFreq, 1000);
            noiseFilter.Q.value = toFiniteNumber(noiseConfig.filterQ, 1);

            noiseNode.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(panNode);
            noiseNode.start(time);
        }

        // Adjust oscillator gains based on noise mix
        const oscMix = 1 - noiseMix;
        oscNodes.forEach(({ gain }) => {
            gain.gain.value = gain.gain.value * oscMix;
        });

        panNode.connect(gainEnv);
        this.connectToStripInput(gainEnv, strip);

        /* ---------------- LFO TARGET ---------------- */

        switch (generatedSound.lfo?.target) {
            case "VCO1": if (v1) lfoGain.connect(v1.osc.detune); break;
            case "VCO2": if (v2) lfoGain.connect(v2.osc.detune); break;
            case "VCO3": if (v3) lfoGain.connect(v3.osc.detune); break;
            case "FLT":
                lfoGain.connect(strip.filter1.frequency);
                lfoGain.connect(strip.filter2.frequency);
                break;
        }

        /* ---------------- ENVELOPE ADSR ---------------- */

        const masterVolume = toFiniteNumber(generatedSound.masterVolume, 0.8);
        const peakGain = noteVelo * masterVolume * accentMultiplier;
        const attackTime = accentAttack;

        gainEnv.gain.setValueAtTime(0, time);
        gainEnv.gain.linearRampToValueAtTime(
            peakGain,
            time + attackTime
        );
        gainEnv.gain.setValueAtTime(
            peakGain * env.sustain,
            time + attackTime + env.decay
        );

        gainEnv.gain.linearRampToValueAtTime(
            peakGain * env.sustain,
            time + attackTime + env.decay
        );

        const releaseStart = time + attackTime + env.decay;

        gainEnv.gain.linearRampToValueAtTime(
            0,
            releaseStart + env.release
        );

        /* ---------------- START / STOP ---------------- */

        const stopTime = releaseStart + env.release + 0.05;

        oscNodes.forEach(({ osc }) => {
            osc.onended = cleanup;
            osc.start(time);
            osc.stop(stopTime);
        });

        if (noiseNode) {
            noiseNode.stop(stopTime + 0.1);
        }

        this.registerVoice(track, { stop })

    }




}
