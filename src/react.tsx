import {
  createContext, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type HTMLAttributes, type ReactNode,
} from 'react';
import { createSoundEngine, type SoundEngine, type SoundState, type SoundStyle } from './core';

export type SoundsContextValue = SoundState & Pick<SoundEngine,
  'enable' | 'disable' | 'play' | 'stop' | 'setStyle' | 'setVolume' | 'setMuted'>;

/**
 * Plays and stops cues. Unlike `useSounds()`, the player never changes, so a component that
 * only plays cues does not re-render each time the volume moves or sound turns on.
 */
export type SoundPlayer = Pick<SoundEngine, 'play' | 'stop'>;

export interface SoundsProviderProps {
  /** The style explicitly selected by the user for this app. */
  style: SoundStyle;
  initialVolume?: number;
  initialMuted?: boolean;
  children: ReactNode;
}

const SoundsContext = createContext<SoundsContextValue | null>(null);
const SoundPlayerContext = createContext<SoundPlayer | null>(null);

/** Creates no live audio context until a consumer invokes enable from a user gesture. */
export function SoundsProvider({ style, initialVolume = 0.25, initialMuted = false, children }: SoundsProviderProps) {
  const [engine, setEngine] = useState(() => createSoundEngine({ style, volume: initialVolume, muted: initialMuted }));
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);

  useEffect(() => {
    // React Strict Mode replays effect setup after cleanup. Recreate the disposed
    // engine instead of preserving an invalid instance or deferring teardown.
    if (engine.getState().status === 'disposed') {
      const previous = engine.getState();
      setEngine(createSoundEngine({ style: previous.style, volume: previous.volume, muted: previous.muted }));
      return;
    }
    return () => engine.dispose();
  }, [engine]);

  useEffect(() => {
    if (engine.getState().status !== 'disposed') engine.setStyle(style);
  }, [engine, style]);

  useEffect(() => {
    const stopWhenHidden = () => { if (document.hidden) engine.stop(); };
    const stopWhenLeaving = () => engine.disable();
    document.addEventListener('visibilitychange', stopWhenHidden);
    window.addEventListener('pagehide', stopWhenLeaving);
    return () => {
      document.removeEventListener('visibilitychange', stopWhenHidden);
      window.removeEventListener('pagehide', stopWhenLeaving);
    };
  }, [engine]);

  // One player for the provider's whole life. It reaches the newest engine through a ref,
  // so it keeps working after Strict Mode replaces the engine, without changing identity.
  const latestEngine = useRef(engine);
  useEffect(() => { latestEngine.current = engine; }, [engine]);
  const player = useMemo<SoundPlayer>(() => ({
    play: (cue, options) => latestEngine.current.play(cue, options),
    stop: () => latestEngine.current.stop(),
  }), []);

  const value = useMemo<SoundsContextValue>(() => ({
    ...state,
    enable: engine.enable, disable: engine.disable, play: engine.play, stop: engine.stop,
    setStyle: engine.setStyle, setVolume: engine.setVolume, setMuted: engine.setMuted,
  }), [state, engine]);

  return <SoundPlayerContext.Provider value={player}>
    <SoundsContext.Provider value={value}>{children}</SoundsContext.Provider>
  </SoundPlayerContext.Provider>;
}

export function useSounds(): SoundsContextValue {
  const sounds = useContext(SoundsContext);
  if (!sounds) throw new Error('useSounds must be used inside SoundsProvider.');
  return sounds;
}

/** A stable `play` and `stop` for components that trigger cues but do not show sound state. */
export function useSoundPlayer(): SoundPlayer {
  const player = useContext(SoundPlayerContext);
  if (!player) throw new Error('useSoundPlayer must be used inside SoundsProvider.');
  return player;
}

export interface SoundControlsProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  /**
   * Called once when the Enable sounds button succeeds, for example to play a short confirmation
   * cue. It is not called when audio could not start, or when sound is enabled some other way.
   */
  onEnabled?: () => void;
}

/**
 * Unstyled native controls. Consumer CSS owns layout and appearance.
 *
 * Each control carries `data-sound-control` (`toggle`, `mute`, `volume-label`, `volume`, `stop`,
 * `status`) and the group carries `data-sound-status`, so CSS can target them by name instead of
 * by element order. The toggle also carries `data-sound-enabled`.
 */
export function SoundControls({ label = 'Sound controls', onEnabled, ...props }: SoundControlsProps) {
  const sounds = useSounds();
  const id = useId();
  const [message, setMessage] = useState('');
  const [enabling, setEnabling] = useState(false);

  async function enable() {
    setEnabling(true);
    setMessage('');
    let enabled = false;
    try {
      enabled = await sounds.enable();
      if (!enabled) setMessage('Audio could not start. Enable sounds again to retry.');
    } catch {
      setMessage('Audio is unavailable in this browser.');
    } finally {
      setEnabling(false);
    }
    // After the try block, so a problem in the app's own callback is not reported as an audio failure.
    if (enabled) onEnabled?.();
  }

  const status = sounds.status === 'disposed' ? 'Sound unavailable.'
    : sounds.status === 'suspended' ? 'Audio paused. Enable sounds to resume.'
    : !sounds.enabled ? 'Sound off.'
    : sounds.muted ? 'Sound muted.'
    : sounds.volume === 0 ? 'Volume is zero.'
    : sounds.playing ? 'Playing sound.' : 'Sound enabled.';

  return <div role="group" aria-label={label} data-sound-status={sounds.status} {...props}>
    <button type="button" data-sound-control="toggle" data-sound-enabled={sounds.enabled}
      disabled={enabling || sounds.status === 'disposed'}
      onClick={sounds.enabled ? sounds.disable : enable}>
      {enabling ? 'Enabling sounds…' : sounds.enabled ? 'Disable sounds' : 'Enable sounds'}
    </button>
    <label data-sound-control="mute" htmlFor={`${id}-mute`}>
      <input id={`${id}-mute`} type="checkbox" checked={sounds.muted}
        onChange={event => sounds.setMuted(event.target.checked)} /> Mute
    </label>
    <label data-sound-control="volume-label" htmlFor={`${id}-volume`}>Volume {Math.round(sounds.volume * 100)}%</label>
    <input data-sound-control="volume" id={`${id}-volume`} type="range" min="0" max="100" step="1"
      value={Math.round(sounds.volume * 100)}
      onChange={event => sounds.setVolume(Number(event.target.value) / 100)} />
    <button type="button" data-sound-control="stop" disabled={!sounds.playing} onClick={sounds.stop}>Stop sound</button>
    <span data-sound-control="status" role="status" aria-live="polite">{message || status}</span>
  </div>;
}
