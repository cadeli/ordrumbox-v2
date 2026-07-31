import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KITS_DIR = path.join(ROOT, 'assets', 'kits');
const DRUMKITS_JSON = path.join(ROOT, 'assets', 'data', 'drumkits.json');

const TARGET_PEAK_DB = -3;
const TARGET_PEAK_LINEAR = Math.pow(10, TARGET_PEAK_DB / 20);

const TONAL_KEYS = new Set([
  'BASS', 'SYNTHLEAD', 'PIANO', 'GUITAR',
  'TOM', 'LO_TOM', 'HI_TOM',
  'COWBELL', 'CONGAS', 'LO_CONGAS', 'HIT'
]);

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

function readWav(buf) {
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataOffset = 44;
  const data = buf.subarray(dataOffset);

  let samples;
  if (bitsPerSample === 16) {
    samples = new Float64Array(data.length / 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = data.readInt16LE(i * 2) / 32768;
    }
  } else if (bitsPerSample === 8) {
    samples = new Float64Array(data.length);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = (data[i] - 128) / 128;
    }
  } else if (bitsPerSample === 24) {
    const count = Math.floor(data.length / 3);
    samples = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const v = data[i * 3] | (data[i * 3 + 1] << 8) | (data[i * 3 + 2] << 16);
      samples[i] = (v << 8 >> 8) / 8388608;
    }
  } else if (bitsPerSample === 32) {
    samples = new Float64Array(data.length / 4);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = data.readInt32LE(i * 4) / 2147483648;
    }
  }

  return { channels, sampleRate, bitsPerSample, samples, dataOffset };
}

function detectPeakLinear(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

function detectFundamentalPitch(samples, sampleRate) {
  const maxFreq = 800;
  const minFreq = 40;
  const minPeriod = Math.ceil(sampleRate / maxFreq);
  const maxPeriod = Math.floor(sampleRate / minFreq);
  const n = Math.min(samples.length, sampleRate * 2);
  if (n < minPeriod * 2) return { freq: 0, midi: 0, confidence: 0 };

  const buf = samples.subarray(0, n);
  const ac = new Float64Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += buf[i] * buf[i + lag];
    ac[lag] = sum;
  }
  if (ac[0] === 0) return { freq: 0, midi: 0, confidence: 0 };

  const energyThreshold = ac[0] * 0.2;
  let bestLag = 0;
  let bestVal = -Infinity;
  const upperLag = Math.min(maxPeriod, n - 1);
  for (let lag = minPeriod; lag <= upperLag; lag++) {
    if (ac[lag] > energyThreshold && ac[lag] > bestVal) {
      bestVal = ac[lag];
      bestLag = lag;
    }
  }
  if (bestLag === 0) return { freq: 0, midi: 0, confidence: 0 };

  if (bestLag > 1 && bestLag < n - 2) {
    const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1];
    const denom = 2 * (2 * b - a - c);
    if (denom !== 0) {
      const shift = (a - c) / denom;
      if (shift > -1 && shift < 1) bestLag += shift;
    }
  }

  const freq = sampleRate / bestLag;
  const confidence = bestVal / ac[0];
  return {
    freq: Math.round(freq * 10) / 10,
    midi: Math.round(freqToMidi(freq)),
    confidence: Math.round(confidence * 1000) / 1000
  };
}

function normalizeToPeak(samples, targetPeak) {
  const currentPeak = detectPeakLinear(samples);
  if (currentPeak === 0) return samples;
  const gain = targetPeak / currentPeak;
  const out = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i] * gain;
  }
  return out;
}

function writeWav(originalBuf, newSamples, bitsPerSample, dataOffset) {
  const out = Buffer.from(originalBuf);
  if (bitsPerSample === 16) {
    for (let i = 0; i < newSamples.length; i++) {
      out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, newSamples[i])) * 32767), dataOffset + i * 2);
    }
  } else if (bitsPerSample === 8) {
    for (let i = 0; i < newSamples.length; i++) {
      out[dataOffset + i] = Math.round(Math.max(-1, Math.min(1, newSamples[i])) * 127 + 128);
    }
  } else if (bitsPerSample === 24) {
    for (let i = 0; i < newSamples.length; i++) {
      const intVal = Math.round(Math.max(-1, Math.min(1, newSamples[i])) * 8388607);
      out[dataOffset + i * 3] = intVal & 0xff;
      out[dataOffset + i * 3 + 1] = (intVal >> 8) & 0xff;
      out[dataOffset + i * 3 + 2] = (intVal >> 16) & 0xff;
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < newSamples.length; i++) {
      out.writeInt32LE(Math.round(Math.max(-1, Math.min(1, newSamples[i])) * 2147483647), dataOffset + i * 4);
    }
  }
  return out;
}

function main() {
  const drumkits = JSON.parse(fs.readFileSync(DRUMKITS_JSON, 'utf8'));

  const wavFiles = [];
  for (const kit of drumkits) {
    for (const inst of kit.instruments) {
      wavFiles.push({ kit, inst, wavPath: path.join(KITS_DIR, inst.url) });
    }
  }

  console.log(`Processing ${wavFiles.length} samples -> normalize to ${TARGET_PEAK_DB}dB peak\n`);

  const noteChanges = [];

  for (const { kit, inst, wavPath } of wavFiles) {
    if (!fs.existsSync(wavPath)) { console.log(`  MISSING: ${wavPath}`); continue; }

    const buf = fs.readFileSync(wavPath);
    const wav = readWav(buf);
    const oldPeakLinear = detectPeakLinear(wav.samples);
    const oldPeakDb = oldPeakLinear > 0 ? Math.round(20 * Math.log10(oldPeakLinear) * 100) / 100 : -Infinity;

    const { freq, midi, confidence } = detectFundamentalPitch(wav.samples, wav.sampleRate);

    const normalized = normalizeToPeak(wav.samples, TARGET_PEAK_LINEAR);
    const newPeakLinear = detectPeakLinear(normalized);
    const newPeakDb = newPeakLinear > 0 ? Math.round(20 * Math.log10(newPeakLinear) * 100) / 100 : -Infinity;

    const newBuf = writeWav(buf, normalized, wav.bitsPerSample, wav.dataOffset);
    fs.writeFileSync(wavPath, newBuf);

    const isTonal = TONAL_KEYS.has(inst.key);
    const oldMidi = inst.rootMidi;
    const oldNote = midiToNoteName(oldMidi);
    let midiChanged = false;

    if (isTonal && midi > 0 && confidence > 0.25) {
      const freqCents = Math.abs(1200 * Math.log2(freq / (440 * Math.pow(2, (midi - 69) / 12))));
      if (freqCents < 50 && midi !== oldMidi) {
        inst.rootMidi = midi;
        midiChanged = true;
      }
    }

    inst.peakDb = TARGET_PEAK_DB;

    const tag = isTonal ? 'TONAL' : 'PERC ';
    const noteStr = midiChanged ? `${oldMidi}(${oldNote}) -> ${inst.rootMidi}(${midiToNoteName(inst.rootMidi)})` : `${inst.rootMidi}(${oldNote}) [same]`;
    console.log(`  [${tag}] ${path.relative(KITS_DIR, wavPath).padEnd(30)} peak: ${oldPeakDb.toFixed(1)} -> ${newPeakDb.toFixed(1)} dB  note: ${noteStr}  freq: ${freq || '-'} Hz  conf: ${confidence}`);

    if (midiChanged) {
      noteChanges.push({ file: path.relative(KITS_DIR, wavPath), from: `${oldMidi}(${oldNote})`, to: `${inst.rootMidi}(${midiToNoteName(inst.rootMidi)})`, freq });
    }
  }

  fs.writeFileSync(DRUMKITS_JSON, JSON.stringify(drumkits, null, 4) + '\n');

  console.log(`\nDone: 102 files normalized to ${TARGET_PEAK_DB}dB, ${noteChanges.length} notes corrected.`);
  if (noteChanges.length > 0) {
    console.log('\nNote corrections:');
    for (const c of noteChanges) {
      console.log(`  ${c.file}: ${c.from} -> ${c.to} (${c.freq} Hz)`);
    }
  }
}

main();
