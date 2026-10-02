import { vi } from "vitest";

export class MockAudioParam {
  events: Array<{ type: string; value?: number; time: number }> = [];
  constructor(public value = 1) {}
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: "set", value, time }); return this; }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: "linear", value, time }); return this; }
  exponentialRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: "exponential", value, time }); return this; }
  cancelAndHoldAtTime(time: number) { this.events.push({ type: "hold", time }); return this; }
  cancelScheduledValues(time: number) { this.events.push({ type: "cancel", time }); return this; }
}

export class MockAudioNode {
  disconnected = false;
  disconnectCalls = 0;
  connections: unknown[] = [];
  connect(node: unknown) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.disconnectCalls += 1; this.connections = []; }
}
export class MockGainNode extends MockAudioNode { gain = new MockAudioParam(1); }
export class MockSource extends MockAudioNode {
  startAt = Number.NaN;
  stopAt = Number.NaN;
  stops: number[] = [];
  onended: (() => void) | null = null;
  ended = false;
  start(at = 0) { this.startAt = at; }
  stop(at = 0) { this.stopAt = at; this.stops.push(at); }
  finish() { if (!this.ended) { this.ended = true; this.onended?.(); } }
}
export class MockOscillator extends MockSource {
  type: OscillatorType = "sine";
  frequency = new MockAudioParam(440);
  detune = new MockAudioParam(0);
}
export class MockAudioBuffer {
  duration: number;
  private channels: Float32Array[];
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(index: number) { return this.channels[index]; }
}
export class MockBufferSource extends MockSource { buffer: MockAudioBuffer | null = null; }

export interface MockAudioOptions {
  deferResume?: boolean;
  rejectResume?: boolean;
  initialState?: AudioContextState;
}

export class MockAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state: AudioContextState | "interrupted";
  destination = new MockAudioNode();
  gains: MockGainNode[] = [];
  sources: MockSource[] = [];
  buffers: MockAudioBuffer[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  onstatechange: (() => void) | null = null;
  private pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  constructor(public options: MockAudioOptions = {}) { this.state = options.initialState ?? "suspended"; }
  createGain() { const node = new MockGainNode(); this.gains.push(node); return node; }
  createOscillator() { const node = new MockOscillator(); this.sources.push(node); return node; }
  createBufferSource() { const node = new MockBufferSource(); this.sources.push(node); return node; }
  createBuffer(channels: number, length: number, rate: number) {
    const buffer = new MockAudioBuffer(channels, length, rate); this.buffers.push(buffer); return buffer;
  }
  changeState(state: AudioContextState | "interrupted") { this.state = state; this.onstatechange?.(); }
  resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.options.rejectResume) return Promise.reject(new Error("resume rejected"));
    if (this.options.deferResume) return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
    this.changeState("running");
    return Promise.resolve();
  }
  resolveResume(state: AudioContextState = "running") {
    const pending = this.pending.shift();
    if (!pending) throw new Error("No pending resume");
    this.changeState(state); pending.resolve();
  }
  rejectResume() { this.pending.shift()?.reject(new Error("resume rejected")); }
  suspend() { this.suspendCalls += 1; this.changeState("suspended"); return Promise.resolve(); }
  close() { this.closeCalls += 1; this.changeState("closed"); return Promise.resolve(); }
  finishSources() { for (const source of this.sources) source.finish(); }
}

export class MockOfflineAudioContext extends MockAudioContext {
  constructor(public channels: number, public length: number, rate: number) { super({ initialState: "running" }); this.sampleRate = rate; }
  startRendering() { return Promise.resolve(new MockAudioBuffer(this.channels, this.length, this.sampleRate)); }
}

/** Explicit test fixture. Importing this module changes no global browser APIs. */
export function installMockAudio(options: MockAudioOptions = {}) {
  const contexts: MockAudioContext[] = [];
  const offlineContexts: MockOfflineAudioContext[] = [];
  const activation = { isActive: false, hasBeenActive: false };
  class Context extends MockAudioContext {
    constructor(_options?: AudioContextOptions) { super(options); contexts.push(this); }
  }
  class Offline extends MockOfflineAudioContext {
    constructor(channels: number, length: number, rate: number) { super(channels, length, rate); offlineContexts.push(this); }
  }
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("OfflineAudioContext", Offline);
  vi.stubGlobal("navigator", { userAgent: globalThis.navigator?.userAgent ?? "test", userActivation: activation });
  return {
    contexts, offlineContexts,
    setActivation(active: boolean) { activation.isActive = active; if (active) activation.hasBeenActive = true; },
    restore() { vi.unstubAllGlobals(); },
  };
}
