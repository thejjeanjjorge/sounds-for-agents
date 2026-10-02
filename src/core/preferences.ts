/**
 * What an app may keep between visits: the listener's volume and whether they muted sound.
 *
 * Whether sound is *enabled* is deliberately not part of it. Audio must always start from a
 * user action, so restoring preferences can never turn sound on. The style is not stored
 * either: it is the app's explicit, user-approved choice, not a listener setting.
 */
export interface SoundPreferences {
  volume: number;
  muted: boolean;
}

/** The part of `Storage` these helpers use, so tests and non-browser hosts can pass their own. */
export type SoundPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/** Match the engine's own defaults; the agent-contract check keeps them in step with the catalog. */
export const DEFAULT_SOUND_PREFERENCES: Readonly<SoundPreferences> = Object.freeze({ volume: 0.25, muted: false });

function browserStorage(): SoundPreferenceStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Merely reading localStorage can throw when site data is blocked.
    return null;
  }
}

/** Anything unreadable or out of range falls back to the defaults, so a bad value never reaches the engine. */
export function parseSoundPreferences(raw: string | null | undefined): SoundPreferences {
  if (!raw) return { ...DEFAULT_SOUND_PREFERENCES };
  try {
    const saved = JSON.parse(raw) as { volume?: unknown; muted?: unknown } | null;
    const volume = typeof saved?.volume === "number" && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 1
      ? saved.volume
      : DEFAULT_SOUND_PREFERENCES.volume;
    return { volume, muted: saved?.muted === true };
  } catch {
    return { ...DEFAULT_SOUND_PREFERENCES };
  }
}

/** Reads saved preferences. Never throws: missing, blocked, or damaged storage yields the defaults. */
export function loadSoundPreferences(key: string, storage: SoundPreferenceStorage | null = browserStorage()): SoundPreferences {
  try {
    return parseSoundPreferences(storage?.getItem(key));
  } catch {
    return { ...DEFAULT_SOUND_PREFERENCES };
  }
}

/** Saves volume and mute only. Never throws: sound keeps working for this visit if storage is blocked or full. */
export function saveSoundPreferences(
  key: string,
  preferences: SoundPreferences,
  storage: SoundPreferenceStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(key, JSON.stringify({ volume: preferences.volume, muted: preferences.muted }));
  } catch {
    // Persistence is a convenience; the engine already holds the live values.
  }
}
