import type { SoundCue, SoundEngine, SoundEngineOptions, SoundPlayResult, SoundState, SoundStyle } from "./types";
import { assertStyle, isSoundCue, isSoundStyle, NOMINAL_GAIN, scheduleCue, SCHEDULING_LEAD, STOP_RELEASE, type ScheduledCue } from "./synth";

interface Run extends ScheduledCue {
  output: GainNode;
  timer: ReturnType<typeof setTimeout> | null;
  cleaned: boolean;
}
interface EnableAttempt {
  generation: number;
  context: AudioContext | null;
  promise: Promise<boolean> | null;
}

function clampVolume(value: number): number {
  return typeof value !== "number" || Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));
}

function hasActivation(): boolean {
  const activation = globalThis.navigator?.userActivation;
  // Older browsers enforce their own gesture policy in resume(). There is no
  // automatic enable path; callers must still invoke this in a trusted event.
  return !activation || activation.isActive;
}

/** Framework-independent, silent until a deliberate enable in a trusted event. */
export function createSoundEngine(options: SoundEngineOptions): SoundEngine {
  assertStyle(options?.style);
  let style = options.style;
  let volume = options.volume === undefined ? 0.25 : clampVolume(options.volume);
  let muted = Boolean(options.muted);
  let enabled = false;
  let disposed = false;
  let interrupted = false;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let active: Run | null = null;
  const retiring = new Set<Run>();
  const listeners = new Set<() => void>();
  let generation = 0;
  let enabling: EnableAttempt | null = null;
  let minimumNextStart = 0;
  let snapshot: SoundState = Object.freeze({ style, enabled, volume, muted, playing: false, status: "disabled" });

  function isEnabled(): boolean {
    return !disposed && enabled && !interrupted && context?.state === "running";
  }

  function publish(reason?: string): void {
    const stateEnabled = isEnabled();
    const status = disposed ? "disposed" : interrupted ? "suspended" : !stateEnabled ? "disabled"
      : muted || volume === 0 ? "muted" : active ? "playing" : "ready";
    if (snapshot.style === style && snapshot.enabled === stateEnabled && snapshot.volume === volume
      && snapshot.muted === muted && snapshot.playing === Boolean(active)
      && snapshot.status === status && snapshot.reason === reason) return;
    snapshot = Object.freeze({ style, enabled: stateEnabled, volume, muted, playing: Boolean(active), status, ...(reason ? { reason } : {}) });
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Consumers cannot interrupt audio cleanup. */ }
    }
  }

  function cleanup(run: Run): void {
    if (run.cleaned) return;
    run.cleaned = true;
    retiring.delete(run);
    if (run.timer !== null) clearTimeout(run.timer);
    for (const source of run.sources) source.onended = null;
    for (const node of run.nodes) { try { node.disconnect(); } catch { /* already disconnected */ } }
    if (active === run) { active = null; publish(); }
  }

  function clearRetiring(): void {
    for (const run of retiring) {
      for (const source of run.sources) { try { source.stop(context?.currentTime ?? 0); } catch { /* already ended */ } }
      cleanup(run);
    }
  }

  function stop(): void {
    minimumNextStart = 0;
    if (!active) return;
    const run = active;
    const now = context?.currentTime ?? 0;
    const sounding = run.startTimes.some((at, index) => at <= now && run.stopTimes[index] > now);
    if (!context || context.state !== "running" || !sounding) {
      for (const source of run.sources) { try { source.stop(now); } catch { /* already ended */ } }
      cleanup(run);
      return;
    }
    active = null;
    retiring.add(run);
    if (run.timer !== null) clearTimeout(run.timer);
    const releaseEnd = now + STOP_RELEASE;
    const param = run.output.gain;
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
    else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
    param.linearRampToValueAtTime(0, releaseEnd);
    run.sources.forEach((source, index) => {
      const stopAt = run.startTimes[index] > now ? now : Math.max(now, Math.min(releaseEnd, run.stopTimes[index]));
      try { source.stop(stopAt); } catch { /* already ended */ }
    });
    run.timer = setTimeout(() => cleanup(run), 52);
    publish();
  }

  function rampMaster(target: number): void {
    if (!context || !master || context.state === "closed") return;
    const now = context.currentTime;
    const param = master.gain;
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
    else { const value = param.value; param.cancelScheduledValues(now); param.setValueAtTime(value, now); }
    param.linearRampToValueAtTime(target, now + 0.025);
  }

  function effectiveGain(): number {
    return isEnabled() && !muted ? volume * NOMINAL_GAIN : 0;
  }

  function handleContextState(current: AudioContext): void {
    if (disposed || current !== context) return;
    if (current.state !== "running") {
      const liveAttempt = enabling?.generation === generation;
      if (enabled || liveAttempt) {
        generation += 1;
        enabling = null;
        enabled = false;
        interrupted = true;
      }
      stop();
      clearRetiring();
      rampMaster(0);
      publish(interrupted ? "suspended" : undefined);
    } else if (!enabled || interrupted) {
      // A browser may auto-resume its context. Authorization remains disabled;
      // stale notes were canceled and only a fresh explicit enable can restore it.
      rampMaster(0);
      publish(interrupted ? "suspended" : undefined);
    }
  }

  function enable(): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    if (isEnabled()) return Promise.resolve(true);
    if (enabling?.generation === generation && enabling.promise) return enabling.promise;
    const platform = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Context = platform.AudioContext ?? platform.webkitAudioContext;
    if (!Context) { publish("unavailable"); return Promise.resolve(false); }
    if (!hasActivation()) { publish("gesture-required"); return Promise.resolve(false); }
    const attempt: EnableAttempt = { generation: ++generation, context: null, promise: null };
    enabling = attempt;
    let settingUp: AudioContext | null = null;
    try {
      if (!context || context.state === "closed") {
        if (context) context.onstatechange = null;
        if (master) { try { master.disconnect(); } catch { /* already disconnected */ } }
        const current = new Context({ latencyHint: "interactive" });
        settingUp = current;
        const gain = current.createGain();
        gain.gain.setValueAtTime(0, current.currentTime);
        gain.connect(current.destination);
        context = current;
        master = gain;
        settingUp = null;
        current.onstatechange = () => handleContextState(current);
      }
      attempt.context = context;
      // This call begins synchronously in the user event, before awaiting.
      const resuming = context.state === "running" ? Promise.resolve() : context.resume();
      attempt.promise = Promise.resolve(resuming).then(() => {
        if (disposed || attempt.generation !== generation || context !== attempt.context) return false;
        if (context?.state !== "running") {
          enabled = false;
          interrupted = true;
          publish("suspended");
          return false;
        }
        enabled = true;
        interrupted = false;
        rampMaster(effectiveGain());
        publish();
        return true;
      }, () => {
        if (disposed || attempt.generation !== generation) return false;
        enabled = false;
        publish("activation-rejected");
        return false;
      }).finally(() => { if (enabling === attempt) enabling = null; });
      return attempt.promise;
    } catch {
      if (settingUp) {
        settingUp.onstatechange = null;
        try { void settingUp.close().catch(() => {}); } catch { /* partially initialized device */ }
      }
      if (enabling === attempt) enabling = null;
      enabled = false;
      publish("activation-rejected");
      return Promise.resolve(false);
    }
  }

  function disable(): void {
    if (disposed) return;
    generation += 1;
    enabling = null;
    enabled = false;
    interrupted = false;
    rampMaster(0);
    stop();
    publish();
  }

  function play(cue: SoundCue, playOptions: { style?: SoundStyle } = {}): SoundPlayResult {
    const reject = (reason: string): SoundPlayResult => ({ accepted: false, duration: 0, reason });
    if (disposed) return reject("disposed");
    if (!isSoundCue(cue)) return reject("invalid-cue");
    const selected = playOptions.style ?? style;
    if (!isSoundStyle(selected)) return reject("invalid-style");
    if (interrupted) return reject("suspended");
    if (!enabled || !context) return reject("not-enabled");
    if (context.state !== "running") { handleContextState(context); return reject("suspended"); }
    if (muted || volume === 0) return reject("muted");
    if (active || context.currentTime < minimumNextStart) return reject("busy");
    let output: GainNode | null = null;
    try {
      const start = context.currentTime + SCHEDULING_LEAD;
      output = context.createGain();
      output.gain.setValueAtTime(1, context.currentTime);
      output.connect(master!);
      const scheduled = scheduleCue(context, output, selected, cue, start);
      const run: Run = { ...scheduled, nodes: scheduled.nodes.concat(output), output, timer: null, cleaned: false };
      active = run;
      minimumNextStart = start + run.duration;
      let remaining = run.sources.length;
      for (const source of run.sources) source.onended = () => { remaining -= 1; if (remaining === 0) cleanup(run); };
      run.timer = setTimeout(() => cleanup(run), (run.duration + 0.06) * 1000);
      publish();
      return { accepted: true, duration: run.duration + SCHEDULING_LEAD };
    } catch {
      stop();
      if (output) { try { output.disconnect(); } catch { /* already disconnected */ } }
      publish("playback-failed");
      return reject("playback-failed");
    }
  }

  function dispose(): void {
    if (disposed) return;
    generation += 1;
    enabling = null;
    enabled = false;
    stop();
    clearRetiring();
    disposed = true;
    interrupted = false;
    if (master) { try { master.disconnect(); } catch { /* already disconnected */ } }
    if (context) {
      context.onstatechange = null;
      try { void context.close().catch(() => {}); } catch { /* already closed */ }
    }
    publish();
    listeners.clear();
  }

  return {
    enable, disable, play, stop, dispose,
    setStyle(next) { assertStyle(next); if (disposed || next === style) return; stop(); style = next; publish(); },
    setVolume(next) { if (disposed) return; volume = clampVolume(next); rampMaster(effectiveGain()); if (volume === 0) stop(); publish(); },
    setMuted(next) { if (disposed) return; muted = Boolean(next); rampMaster(effectiveGain()); if (muted) stop(); publish(); },
    getState: () => snapshot,
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
