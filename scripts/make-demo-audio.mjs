import { mkdir, writeFile } from 'node:fs/promises';

const sampleRate = 44100;
const durationSeconds = 28;
const channels = 1;
const totalSamples = sampleRate * durationSeconds;

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function note(freq, time, gain) {
  const attack = Math.min(time / 2.8, 1);
  const envelope = Math.min(1, attack) * Math.max(0, 1 - time / durationSeconds * 0.34);
  return Math.sin(2 * Math.PI * freq * time) * gain * envelope;
}

function pluck(freq, time, offset, gain) {
  const local = time - offset;
  if (local < 0 || local > 2.8) return 0;
  const envelope = Math.exp(-local * 1.2);
  return Math.sin(2 * Math.PI * freq * local) * gain * envelope;
}

const dataSize = totalSamples * channels * 2;
const buffer = new ArrayBuffer(44 + dataSize);
const view = new DataView(buffer);

writeString(view, 0, 'RIFF');
view.setUint32(4, 36 + dataSize, true);
writeString(view, 8, 'WAVE');
writeString(view, 12, 'fmt ');
view.setUint32(16, 16, true);
view.setUint16(20, 1, true);
view.setUint16(22, channels, true);
view.setUint32(24, sampleRate, true);
view.setUint32(28, sampleRate * channels * 2, true);
view.setUint16(32, channels * 2, true);
view.setUint16(34, 16, true);
writeString(view, 36, 'data');
view.setUint32(40, dataSize, true);

const roots = [196, 220, 174.61, 196];

for (let i = 0; i < totalSamples; i += 1) {
  const t = i / sampleRate;
  const chord = roots[Math.floor(t / 7) % roots.length];
  const phraseStart = Math.floor(t / 3.5) * 3.5;
  const melody =
    pluck(chord * 2, t, phraseStart + 0.15, 0.2) +
    pluck(chord * 2.5, t, phraseStart + 1.05, 0.16) +
    pluck(chord * 3, t, phraseStart + 2.1, 0.14);
  const breath = Math.sin(2 * Math.PI * 0.09 * t) * 0.035;
  const shimmer = Math.sin(2 * Math.PI * 880 * t) * 0.025 * Math.max(0, Math.sin(Math.PI * t / durationSeconds));
  const signal =
    note(chord, t, 0.38) +
    note(chord * 1.5, t, 0.2) +
    note(chord * 2, t, 0.12) +
    melody +
    breath +
    shimmer;
  const sample = Math.max(-1, Math.min(1, signal));
  view.setInt16(44 + i * 2, sample * 0x7fff, true);
}

await mkdir('public/audio', { recursive: true });
await writeFile('public/audio/evening-wind.wav', Buffer.from(buffer));
