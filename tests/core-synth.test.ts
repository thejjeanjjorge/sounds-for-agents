import { afterEach, describe, expect, it, vi } from "vitest";
import { getCueDuration, renderCue, SOUND_CUES, SOUND_STYLES, type SoundCue, type SoundStyle } from "../src/core";
import { scheduleCue } from "../src/core/synth";
import { installMockAudio, MockAudioContext, MockGainNode, MockOscillator } from "./helpers/mock-audio";

afterEach(() => vi.unstubAllGlobals());

describe("original shared synth recipes", () => {
  it("keeps all twelve cues bounded with quiet envelopes and no square waves", () => {
    for (const style of SOUND_STYLES) for (const cue of SOUND_CUES) {
      const context = new MockAudioContext(); const destination = context.destination;
      const run = scheduleCue(context as unknown as BaseAudioContext, destination as unknown as AudioNode, style, cue, 0.1);
      expect(getCueDuration(style, cue)).toBeGreaterThan(0.2); expect(getCueDuration(style, cue)).toBeLessThan(0.8);
      expect(run.sources.length).toBeLessThanOrEqual(8);
      expect(Math.max(...run.stopTimes) - 0.1).toBeLessThanOrEqual(run.duration);
      for (const node of context.sources) if (node instanceof MockOscillator) expect(node.type).not.toBe("square");
      for (const gain of context.gains) {
        expect(gain.gain.events[0]).toEqual({ type: "set", value: 0, time: 0 });
        expect(Math.max(...gain.gain.events.map(event => event.value ?? 0))).toBeLessThanOrEqual(0.14);
        expect(gain.gain.events.at(-1)?.value).toBe(0);
      }
    }
  });

  it("renders offline using the same scheduler without constructing a live context", async () => {
    const audio = installMockAudio(); const buffer = await renderCue("tactile", "complete", { sampleRate: 48000 });
    expect(audio.contexts).toHaveLength(0); expect(audio.offlineContexts).toHaveLength(1);
    expect(buffer.sampleRate).toBe(48000); expect(buffer.duration).toBeLessThan(0.8);
    const offline = audio.offlineContexts[0];
    const direct = new MockAudioContext(); scheduleCue(direct as unknown as BaseAudioContext, direct.destination as unknown as AudioNode, "tactile", "complete", 0);
    expect(offline.sources.map(source => [source.startAt, source.stopAt])).toEqual(direct.sources.map(source => [source.startAt, source.stopAt]));
    expect(offline.buffers.map(buffer => Array.from(buffer.getChannelData(0)))).toEqual(direct.buffers.map(buffer => Array.from(buffer.getChannelData(0))));
  });

  it("validates runtime render requests and reports unavailable offline support", async () => {
    vi.stubGlobal("OfflineAudioContext", undefined); vi.stubGlobal("webkitOfflineAudioContext", undefined);
    await expect(renderCue("missing" as SoundStyle, "success")).rejects.toThrow("invalid-style");
    await expect(renderCue("soft", "missing" as SoundCue)).rejects.toThrow("invalid-cue");
    await expect(renderCue("soft", "success")).rejects.toThrow("offline-audio-unavailable");
  });
});
