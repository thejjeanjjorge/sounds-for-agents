export const SOUND_STYLES = Object.freeze(["soft", "tactile", "playful"] as const);
export const SOUND_CUES = Object.freeze(["success", "error", "complete", "notification"] as const);

export type SoundStyle = (typeof SOUND_STYLES)[number];
export type SoundCue = (typeof SOUND_CUES)[number];
export type SoundStatus = "disabled" | "ready" | "playing" | "muted" | "suspended" | "disposed";

export interface SoundState {
  readonly style: SoundStyle;
  readonly enabled: boolean;
  readonly volume: number;
  readonly muted: boolean;
  readonly playing: boolean;
  readonly status: SoundStatus;
  readonly reason?: string;
}

export interface SoundEngineOptions {
  /** A style is a deliberate choice; the engine does not choose one for an app. */
  style: SoundStyle;
  volume?: number;
  muted?: boolean;
}

export type SoundPlayResult =
  | { accepted: true; duration: number }
  | { accepted: false; duration: 0; reason: string };

export interface SoundEngine {
  /** Call directly from a trusted click or keyboard activation. */
  enable(): Promise<boolean>;
  disable(): void;
  play(cue: SoundCue, options?: { style?: SoundStyle }): SoundPlayResult;
  stop(): void;
  dispose(): void;
  setStyle(style: SoundStyle): void;
  setVolume(value: number): void;
  setMuted(muted: boolean): void;
  /** Frozen, cached snapshot suitable for useSyncExternalStore. */
  getState(): SoundState;
  subscribe(listener: () => void): () => void;
}
