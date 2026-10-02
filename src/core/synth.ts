import { SOUND_CUES, SOUND_STYLES, type SoundCue, type SoundStyle } from "./types";

export const NOMINAL_GAIN = 0.72;
export const SCHEDULING_LEAD = 0.015;
export const STOP_RELEASE = 0.012;

interface Family {
  wave: OscillatorType;
  pitch: number;
  attack: number;
  duration: number;
  level: number;
  overtone?: number;
  noise?: number;
  glide?: number;
}
interface Note { at: number; frequency: number; length: number }

// Preserve the exact original audition recipes, including their silent baseline.
const families: Record<SoundStyle, Family> = {
  soft: { wave: "sine", pitch: 1, attack: 0.024, duration: 1.12, level: 0.14, overtone: 0.018 },
  tactile: { wave: "triangle", pitch: 0.84, attack: 0.007, duration: 0.82, level: 0.14, noise: 0.024 },
  playful: { wave: "triangle", pitch: 1.18, attack: 0.014, duration: 1, level: 0.13, overtone: 0.022, glide: 0.94 },
};
const cues: Record<SoundCue, readonly Note[]> = {
  success: [
    { at: 0, frequency: 440, length: 0.21 },
    { at: 0.12, frequency: 659.255, length: 0.29 },
  ],
  error: [
    { at: 0, frequency: 329.628, length: 0.22 },
    { at: 0.16, frequency: 261.626, length: 0.29 },
  ],
  complete: [
    { at: 0, frequency: 391.995, length: 0.21 },
    { at: 0.14, frequency: 493.883, length: 0.21 },
    { at: 0.28, frequency: 587.330, length: 0.23 },
    { at: 0.43, frequency: 783.991, length: 0.30 },
  ],
  notification: [
    { at: 0, frequency: 523.251, length: 0.23 },
    { at: 0.10, frequency: 659.255, length: 0.26 },
  ],
};

export function isSoundStyle(value: unknown): value is SoundStyle {
  return typeof value === "string" && (SOUND_STYLES as readonly string[]).includes(value);
}
export function isSoundCue(value: unknown): value is SoundCue {
  return typeof value === "string" && (SOUND_CUES as readonly string[]).includes(value);
}
export function assertStyle(value: unknown): asserts value is SoundStyle {
  if (!isSoundStyle(value)) throw new RangeError("invalid-style");
}
export function assertCue(value: unknown): asserts value is SoundCue {
  if (!isSoundCue(value)) throw new RangeError("invalid-cue");
}

export function scheduledDuration(style: SoundStyle, cue: SoundCue): number {
  return Math.max(...cues[cue].map(note => note.at + note.length * families[style].duration + 0.008));
}

/** Full realtime lifetime, including scheduling lead, release, and source stops. */
export function getCueDuration(style: SoundStyle, cue: SoundCue): number {
  assertStyle(style);
  assertCue(cue);
  return scheduledDuration(style, cue) + SCHEDULING_LEAD;
}

function envelope(param: AudioParam, start: number, end: number, attack: number, peak: number): void {
  const attackEnd = Math.min(start + attack, end - 0.005);
  // A future source can round to a sample just before its envelope event. Gain
  // must already be zero there, rather than GainNode's default value of one.
  param.value = 0;
  param.setValueAtTime(0, 0);
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(peak, attackEnd);
  param.exponentialRampToValueAtTime(0.0001, end - 0.004);
  param.linearRampToValueAtTime(0, end);
}

export interface ScheduledCue {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  startTimes: number[];
  stopTimes: number[];
  duration: number;
}

/** Shared scheduling path. Creates no context, resumes none, and uses no timers. */
export function scheduleCue(
  context: BaseAudioContext,
  destination: AudioNode,
  style: SoundStyle,
  cue: SoundCue,
  start: number,
): ScheduledCue {
  const family = families[style];
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];
  const startTimes: number[] = [];
  const stopTimes: number[] = [];

  function tone(frequency: number, at: number, end: number, level: number, wave: OscillatorType, detune = 0) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.detune.setValueAtTime(detune, at);
    oscillator.frequency.setValueAtTime(frequency * (family.glide ?? 1), at);
    if (family.glide) oscillator.frequency.exponentialRampToValueAtTime(frequency, at + 0.035);
    envelope(gain.gain, at, end, family.attack, level);
    oscillator.connect(gain);
    gain.connect(destination);
    sources.push(oscillator);
    nodes.push(oscillator, gain);
    startTimes.push(at);
    stopTimes.push(end + 0.004);
    oscillator.start(at);
    oscillator.stop(end + 0.004);
  }

  try {
    cues[cue].forEach((note, index) => {
      const at = start + note.at;
      const end = at + note.length * family.duration;
      const frequency = note.frequency * family.pitch;
      tone(frequency, at, end, family.level, family.wave);
      if (family.overtone) tone(frequency * 2, at, end, family.overtone, "sine", style === "playful" ? 4 : 0);
      if (family.noise) {
        const frames = Math.max(1, Math.ceil(context.sampleRate * 0.035));
        const buffer = context.createBuffer(1, frames, context.sampleRate);
        const data = buffer.getChannelData(0);
        let seed = 1729 + index * 101 + cue.length * 37;
        let previous = 0;
        for (let i = 0; i < frames; i += 1) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          previous = previous * 0.65 + (seed / 4294967296 * 2 - 1) * 0.35;
          data[i] = previous * Math.pow(1 - i / frames, 2);
        }
        const tick = context.createBufferSource();
        const gain = context.createGain();
        tick.buffer = buffer;
        envelope(gain.gain, at, at + 0.035, 0.003, family.noise);
        tick.connect(gain);
        gain.connect(destination);
        sources.push(tick);
        nodes.push(tick, gain);
        startTimes.push(at);
        stopTimes.push(at + 0.036);
        tick.start(at);
        tick.stop(at + 0.036);
      }
    });
  } catch (error) {
    for (const source of sources) { try { source.stop(); } catch { /* already stopped */ } }
    for (const node of nodes) { try { node.disconnect(); } catch { /* already disconnected */ } }
    throw error;
  }
  return { sources, nodes, startTimes, stopTimes, duration: scheduledDuration(style, cue) };
}

export async function renderCue(
  style: SoundStyle,
  cue: SoundCue,
  options: { sampleRate?: number } = {},
): Promise<AudioBuffer> {
  assertStyle(style);
  assertCue(cue);
  const platform = globalThis as typeof globalThis & { webkitOfflineAudioContext?: typeof OfflineAudioContext };
  const Offline = platform.OfflineAudioContext ?? platform.webkitOfflineAudioContext;
  if (!Offline) throw new Error("offline-audio-unavailable");
  const requested = options.sampleRate;
  const sampleRate = typeof requested === "number" && Number.isFinite(requested)
    ? Math.round(Math.min(96000, Math.max(8000, requested)))
    : 48000;
  const context = new Offline(1, Math.ceil((scheduledDuration(style, cue) + 0.025) * sampleRate), sampleRate);
  const gain = context.createGain();
  gain.gain.setValueAtTime(NOMINAL_GAIN, 0);
  gain.connect(context.destination);
  scheduleCue(context, gain, style, cue, 0);
  return context.startRendering();
}
