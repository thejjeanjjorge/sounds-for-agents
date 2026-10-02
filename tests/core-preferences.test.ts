import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SOUND_PREFERENCES, createSoundEngine, loadSoundPreferences, parseSoundPreferences, saveSoundPreferences,
} from '../src/core';

const KEY = 'app-sound';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
  };
}

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('sound preferences', () => {
  it('default to what the engine itself starts with', () => {
    const engine = createSoundEngine({ style: 'soft' });
    expect(engine.getState()).toMatchObject({ volume: DEFAULT_SOUND_PREFERENCES.volume, muted: DEFAULT_SOUND_PREFERENCES.muted });
    engine.dispose();
    expect(loadSoundPreferences(KEY, memoryStorage())).toEqual(DEFAULT_SOUND_PREFERENCES);
  });

  it('restore a saved volume and mute, including the edges of the range', () => {
    for (const preferences of [{ volume: 0.6, muted: false }, { volume: 0, muted: true }, { volume: 1, muted: true }]) {
      const storage = memoryStorage();
      saveSoundPreferences(KEY, preferences, storage);
      expect(loadSoundPreferences(KEY, storage)).toEqual(preferences);
    }
  });

  it('fall back to the defaults for unreadable or out-of-range data', () => {
    for (const raw of ['not json', '{}', 'null', '[]', '42', '{"volume":2}', '{"volume":-0.1}', '{"volume":"0.5"}', '{"volume":null}']) {
      expect(parseSoundPreferences(raw), raw).toEqual(DEFAULT_SOUND_PREFERENCES);
    }
    // A bad volume does not discard a valid mute choice, and only a real true counts as muted.
    expect(parseSoundPreferences('{"volume":9,"muted":true}')).toEqual({ volume: 0.25, muted: true });
    expect(parseSoundPreferences('{"volume":0.5,"muted":"yes"}').muted).toBe(false);
  });

  it('store only volume and mute, never whether sound is enabled or which style is chosen', () => {
    const storage = memoryStorage();
    saveSoundPreferences(KEY, { volume: 0.4, muted: true, enabled: true, style: 'playful' } as never, storage);
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual({ volume: 0.4, muted: true });
    // Even a hand-edited entry cannot switch sound on: nothing in the result says "enabled".
    storage.data.set(KEY, '{"volume":0.4,"muted":false,"enabled":true,"style":"tactile"}');
    expect(loadSoundPreferences(KEY, storage)).toEqual({ volume: 0.4, muted: false });
  });

  it('never throw when storage is blocked, missing, or full', () => {
    const blocked = {
      getItem() { throw new Error('storage is blocked'); },
      setItem() { throw new Error('storage is full'); },
    };
    expect(loadSoundPreferences(KEY, blocked)).toEqual(DEFAULT_SOUND_PREFERENCES);
    expect(() => saveSoundPreferences(KEY, { volume: 0.5, muted: false }, blocked)).not.toThrow();
    expect(loadSoundPreferences(KEY, null)).toEqual(DEFAULT_SOUND_PREFERENCES);
    expect(() => saveSoundPreferences(KEY, { volume: 0.5, muted: false }, null)).not.toThrow();
  });

  it('use localStorage when no storage is given, and survive it being unavailable', () => {
    // Node has no localStorage here, which is also what server rendering looks like.
    expect(loadSoundPreferences(KEY)).toEqual(DEFAULT_SOUND_PREFERENCES);
    expect(() => saveSoundPreferences(KEY, { volume: 0.5, muted: true })).not.toThrow();

    const storage = memoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    saveSoundPreferences(KEY, { volume: 0.7, muted: true });
    expect(loadSoundPreferences(KEY)).toEqual({ volume: 0.7, muted: true });

    // Merely reading localStorage throws when site data is blocked.
    Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('blocked'); }, configurable: true });
    expect(loadSoundPreferences(KEY)).toEqual(DEFAULT_SOUND_PREFERENCES);
    expect(() => saveSoundPreferences(KEY, { volume: 0.5, muted: false })).not.toThrow();
  });
});
