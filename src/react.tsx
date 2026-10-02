import {
  createContext, useContext, useEffect, useId, useMemo, useState, useSyncExternalStore,
  type HTMLAttributes, type ReactNode,
} from 'react';
import { createSoundEngine, type SoundEngine, type SoundState, type SoundStyle } from './core';

export type SoundsContextValue = SoundState & Pick<SoundEngine,
  'enable' | 'disable' | 'play' | 'stop' | 'setStyle' | 'setVolume' | 'setMuted'>;

export interface SoundsProviderProps {
  /** The style explicitly selected by the user for this app. */
  style: SoundStyle;
  initialVolume?: number;
  initialMuted?: boolean;
  children: ReactNode;
}

const SoundsContext = createContext<SoundsContextValue | null>(null);

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

  const value = useMemo<SoundsContextValue>(() => ({
    ...state,
    enable: engine.enable, disable: engine.disable, play: engine.play, stop: engine.stop,
    setStyle: engine.setStyle, setVolume: engine.setVolume, setMuted: engine.setMuted,
  }), [state, engine]);

  return <SoundsContext.Provider value={value}>{children}</SoundsContext.Provider>;
}

export function useSounds(): SoundsContextValue {
  const sounds = useContext(SoundsContext);
  if (!sounds) throw new Error('useSounds must be used inside SoundsProvider.');
  return sounds;
}

export interface SoundControlsProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

/** Unstyled native controls. Consumer CSS owns layout and appearance. */
export function SoundControls({ label = 'Sound controls', ...props }: SoundControlsProps) {
  const sounds = useSounds();
  const id = useId();
  const [message, setMessage] = useState('');
  const [enabling, setEnabling] = useState(false);

  async function enable() {
    setEnabling(true);
    setMessage('');
    try {
      if (!await sounds.enable()) setMessage('Audio could not start. Enable sounds again to retry.');
    } catch {
      setMessage('Audio is unavailable in this browser.');
    } finally {
      setEnabling(false);
    }
  }

  const status = sounds.status === 'disposed' ? 'Sound unavailable.'
    : sounds.status === 'suspended' ? 'Audio paused. Enable sounds to resume.'
    : !sounds.enabled ? 'Sound off.'
    : sounds.muted ? 'Sound muted.'
    : sounds.volume === 0 ? 'Volume is zero.'
    : sounds.playing ? 'Playing sound.' : 'Sound enabled.';

  return <div role="group" aria-label={label} {...props}>
    <button type="button" disabled={enabling || sounds.status === 'disposed'}
      onClick={sounds.enabled ? sounds.disable : enable}>
      {enabling ? 'Enabling sounds…' : sounds.enabled ? 'Disable sounds' : 'Enable sounds'}
    </button>
    <label htmlFor={`${id}-mute`}>
      <input id={`${id}-mute`} type="checkbox" checked={sounds.muted}
        onChange={event => sounds.setMuted(event.target.checked)} /> Mute
    </label>
    <label htmlFor={`${id}-volume`}>Volume {Math.round(sounds.volume * 100)}%</label>
    <input id={`${id}-volume`} type="range" min="0" max="100" step="1"
      value={Math.round(sounds.volume * 100)}
      onChange={event => sounds.setVolume(Number(event.target.value) / 100)} />
    <button type="button" disabled={!sounds.playing} onClick={sounds.stop}>Stop sound</button>
    <span role="status" aria-live="polite">{message || status}</span>
  </div>;
}
