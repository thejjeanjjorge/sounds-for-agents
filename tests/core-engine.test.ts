import { afterEach, describe, expect, it, vi } from "vitest";
import { createSoundEngine, getCueDuration, type SoundEngine, type SoundEngineOptions, type SoundStyle } from "../src/core";
import { installMockAudio, MockAudioContext, MockGainNode } from "./helpers/mock-audio";

const engines: SoundEngine[] = [];
function engine(options: SoundEngineOptions = { style: "soft" }) {
  const created = createSoundEngine(options); engines.push(created); return created;
}
afterEach(() => { for (const created of engines.splice(0)) created.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("silent construction and activation", () => {
  it("creates no audio context on import, construction, preferences, or failed playback", () => {
    const audio = installMockAudio();
    const sounds = engine();
    sounds.setStyle("tactile"); sounds.setVolume(0.6); sounds.setMuted(true);
    expect(sounds.play("success")).toEqual({ accepted: false, duration: 0, reason: "not-enabled" });
    expect(audio.contexts).toHaveLength(0);
    expect(sounds.getState()).toMatchObject({ enabled: false, volume: 0.6, muted: true, status: "disabled" });
  });

  it("is safe without browser APIs and reports unavailable on explicit enable", async () => {
    vi.stubGlobal("AudioContext", undefined); vi.stubGlobal("webkitAudioContext", undefined); vi.stubGlobal("navigator", undefined);
    const sounds = engine();
    expect(sounds.getState().volume).toBe(0.25);
    expect(await sounds.enable()).toBe(false);
    expect(sounds.getState().reason).toBe("unavailable");
  });

  it("requires a deliberate style and rejects invalid style setters", () => {
    expect(() => createSoundEngine({} as SoundEngineOptions)).toThrow("invalid-style");
    expect(() => engine().setStyle("unknown" as SoundStyle)).toThrow("invalid-style");
  });

  it("requires activation before creation or resume and starts resume synchronously", async () => {
    const audio = installMockAudio(); const sounds = engine();
    expect(await sounds.enable()).toBe(false);
    expect(audio.contexts).toHaveLength(0);
    expect(sounds.getState().reason).toBe("gesture-required");
    audio.setActivation(true);
    const enabling = sounds.enable();
    expect(audio.contexts).toHaveLength(1);
    expect(audio.contexts[0].resumeCalls).toBe(1);
    expect(await enabling).toBe(true);
    expect(sounds.getState()).toMatchObject({ enabled: true, status: "ready" });
  });

  it("reports rejected activation without enabling sound", async () => {
    const audio = installMockAudio({ rejectResume: true }); audio.setActivation(true);
    const sounds = engine();
    expect(await sounds.enable()).toBe(false);
    expect(sounds.getState()).toMatchObject({ enabled: false, reason: "activation-rejected" });
    expect(sounds.play("success").accepted).toBe(false);
  });

  it("closes a partially initialized device and allows an explicit retry", async () => {
    const audio = installMockAudio(); audio.setActivation(true);
    const working = globalThis.AudioContext;
    const failed: MockAudioContext[] = [];
    class Broken extends MockAudioContext {
      constructor() { super(); failed.push(this); }
      override createGain(): MockGainNode { throw new Error("device graph failed"); }
    }
    vi.stubGlobal("AudioContext", Broken);
    const sounds = engine(); expect(await sounds.enable()).toBe(false);
    expect(failed[0].closeCalls).toBe(1);
    vi.stubGlobal("AudioContext", working);
    expect(await sounds.enable()).toBe(true);
    expect(sounds.getState().enabled).toBe(true);
  });

  it.each(["disable", "dispose"] as const)("invalidates a pending resume after %s", async operation => {
    const audio = installMockAudio({ deferResume: true }); audio.setActivation(true);
    const sounds = engine(); const enabling = sounds.enable();
    sounds[operation]();
    audio.contexts[0].resolveResume();
    expect(await enabling).toBe(false);
    expect(sounds.getState().enabled).toBe(false);
    expect(sounds.play("success").accepted).toBe(false);
    expect(audio.contexts[0].sources).toHaveLength(0);
  });

  it("ignores a stale enable completion after a newer explicit attempt", async () => {
    const audio = installMockAudio({ deferResume: true }); audio.setActivation(true);
    const sounds = engine(); const old = sounds.enable(); sounds.disable(); const current = sounds.enable();
    audio.contexts[0].resolveResume(); expect(await old).toBe(false);
    audio.contexts[0].resolveResume(); expect(await current).toBe(true);
    expect(sounds.getState().enabled).toBe(true);
  });
});

describe("playback and preferences", () => {
  it("rejects duplicate rapid plays and includes full source lifetime", async () => {
    vi.useFakeTimers(); const audio = installMockAudio(); audio.setActivation(true); const sounds = engine();
    await sounds.enable();
    const result = sounds.play("complete");
    expect(result).toEqual({ accepted: true, duration: getCueDuration("soft", "complete") });
    const sourceCount = audio.contexts[0].sources.length;
    expect(sounds.play("complete")).toEqual({ accepted: false, duration: 0, reason: "busy" });
    expect(audio.contexts[0].sources).toHaveLength(sourceCount);
    expect(Math.max(...audio.contexts[0].sources.map(source => source.stopAt))).toBeLessThanOrEqual(result.duration);
  });

  it("preserves the remembered volume when muted and never plays on unmute", async () => {
    const audio = installMockAudio(); audio.setActivation(true); const sounds = engine({ style: "soft", volume: 0.4 });
    await sounds.enable(); sounds.setMuted(true);
    expect(sounds.getState()).toMatchObject({ volume: 0.4, muted: true, status: "muted" });
    expect(sounds.play("success")).toEqual({ accepted: false, duration: 0, reason: "muted" });
    sounds.setVolume(0.7); sounds.setMuted(false);
    expect(sounds.getState()).toMatchObject({ volume: 0.7, muted: false, playing: false, status: "ready" });
    expect(audio.contexts[0].sources).toHaveLength(0);
  });

  it.each([[-10, 0], [1.5, 1], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 1]])("clamps volume %s safely", (value, expected) => {
    const sounds = engine(); sounds.setVolume(value); expect(sounds.getState().volume).toBe(expected);
  });

  it("treats zero volume as silent even when explicit mute is off", async () => {
    const audio = installMockAudio(); audio.setActivation(true); const sounds = engine({ style: "soft", volume: 0 });
    await sounds.enable(); expect(sounds.play("notification").accepted).toBe(false);
    expect(audio.contexts[0].sources).toHaveLength(0);
  });

  it("validates runtime play requests and permits a one-shot style override", async () => {
    const audio = installMockAudio(); audio.setActivation(true); const sounds = engine(); await sounds.enable();
    expect(sounds.play("missing" as "success")).toMatchObject({ reason: "invalid-cue" });
    expect(sounds.play("success", { style: "missing" as SoundStyle })).toMatchObject({ reason: "invalid-style" });
    expect(sounds.play("success", { style: "tactile" }).accepted).toBe(true);
    expect(sounds.getState().style).toBe("soft");
  });

  it("fades an interrupted cue before a new cue, and old cleanup leaves the new run intact", async () => {
    vi.useFakeTimers(); const audio = installMockAudio(); audio.setActivation(true); const sounds = engine(); await sounds.enable();
    sounds.play("complete"); const context = audio.contexts[0]; const oldSources = [...context.sources]; const oldOutput = context.gains[1];
    context.currentTime = 0.08; sounds.stop();
    expect(oldOutput.gain.events).toContainEqual({ type: "linear", value: 0, time: 0.092 });
    expect(oldSources.every(source => source.stopAt <= 0.092)).toBe(true);
    expect(sounds.play("notification").accepted).toBe(true);
    expect(context.sources.slice(oldSources.length).every(source => source.startAt >= 0.095)).toBe(true);
    vi.advanceTimersByTime(52);
    expect(oldOutput.disconnected).toBe(true);
    expect(sounds.getState().playing).toBe(true);
    expect(sounds.play("error")).toMatchObject({ reason: "busy" });
  });

  it("cancels scheduled notes before their first sample and cleans all timers on dispose", async () => {
    vi.useFakeTimers(); const audio = installMockAudio(); audio.setActivation(true); const sounds = engine(); await sounds.enable();
    sounds.play("complete"); sounds.stop();
    expect(audio.contexts[0].sources.every(source => source.stopAt === 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    sounds.play("success"); audio.contexts[0].currentTime = 0.05; sounds.stop();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    sounds.dispose(); sounds.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(audio.contexts[0].closeCalls).toBe(1);
    expect(audio.contexts[0].gains.every(gain => gain.disconnected)).toBe(true);
  });

  it("stops a disabled engine and never resumes from an ordinary play", async () => {
    const audio = installMockAudio(); audio.setActivation(true); const sounds = engine(); await sounds.enable();
    sounds.play("success"); sounds.disable(); const resumes = audio.contexts[0].resumeCalls;
    expect(sounds.getState()).toMatchObject({ enabled: false, playing: false, status: "disabled" });
    expect(sounds.play("success")).toMatchObject({ reason: "not-enabled" });
    expect(audio.contexts[0].resumeCalls).toBe(resumes);
  });

  it("requires new explicit authorization after an interruption, even if the browser auto-resumes", async () => {
    vi.useFakeTimers(); const audio = installMockAudio(); audio.setActivation(true); const sounds = engine(); await sounds.enable(); sounds.play("complete");
    const context = audio.contexts[0]; context.changeState("interrupted");
    expect(sounds.getState()).toMatchObject({ enabled: false, playing: false, status: "suspended" });
    expect(vi.getTimerCount()).toBe(0);
    context.changeState("running"); expect(sounds.getState().enabled).toBe(false);
    expect(sounds.play("success")).toMatchObject({ reason: "suspended" });
    audio.setActivation(false); expect(await sounds.enable()).toBe(false);
    audio.setActivation(true); expect(await sounds.enable()).toBe(true);
    expect(sounds.getState().status).toBe("ready");
  });
});

describe("state subscriptions", () => {
  it("caches immutable snapshots and only notifies for state changes", () => {
    const sounds = engine(); const listener = vi.fn(); const unsubscribe = sounds.subscribe(listener); const first = sounds.getState();
    expect(Object.isFrozen(first)).toBe(true); expect(sounds.getState()).toBe(first);
    sounds.setVolume(0.25); expect(listener).not.toHaveBeenCalled(); expect(sounds.getState()).toBe(first);
    sounds.setVolume(0.5); expect(listener).toHaveBeenCalledTimes(1); expect(sounds.getState()).not.toBe(first);
    unsubscribe(); sounds.setMuted(true); expect(listener).toHaveBeenCalledTimes(1);
  });

  it("publishes disposal once, releases subscriptions, and tolerates callback errors", () => {
    const sounds = engine(); const listener = vi.fn(); sounds.subscribe(listener); sounds.subscribe(() => { throw new Error("UI error"); });
    expect(() => sounds.dispose()).not.toThrow(); expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = sounds.getState(); sounds.dispose(); sounds.setVolume(1); sounds.setMuted(false);
    expect(sounds.getState()).toBe(snapshot); expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot.status).toBe("disposed");
  });
});
