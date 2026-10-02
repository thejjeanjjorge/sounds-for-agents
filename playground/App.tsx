import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createSoundEngine, SOUND_CUES, SOUND_STYLES, getCueDuration } from '../src/core';
import type { SoundCue, SoundStyle } from '../src/core';

type IconName = 'arrow' | 'check' | 'close' | 'github' | 'headphones' | 'moon' | 'mute' | 'play' | 'spark' | 'stop' | 'sun' | 'volume' | 'wave';
type Choice = 'none' | 'off' | SoundStyle;

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const shapes: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    github: <path d="M9 19c-4 1-4-2-6-2m12 4v-3.5c0-1 .1-1.4-.5-2 3.3-.4 6.5-1.6 6.5-6a4.8 4.8 0 0 0-1.3-3.4 4.5 4.5 0 0 0-.1-3.4s-1.3-.4-3.5 1.3a11.8 11.8 0 0 0-6.3 0C7.3 2.3 6 2.7 6 2.7a4.5 4.5 0 0 0-.1 3.4A4.8 4.8 0 0 0 4.6 9.5c0 4.4 3.2 5.6 6.5 6-.5.5-.6 1.2-.6 2V21" />,
    headphones: <><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="12" width="4" height="8" rx="2" /><rect x="17" y="12" width="4" height="8" rx="2" /></>,
    moon: <path d="M20.7 13A9 9 0 0 1 11 3.3 9 9 0 1 0 20.7 13Z" />,
    mute: <><path d="m11 4-6 4H2v8h3l6 4V4Zm6 5 5 6m0-6-5 6" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>,
    volume: <><path d="m11 4-6 4H2v8h3l6 4V4Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    wave: <path d="M2 12c3.3-12 5.3 12 8.6 0s5.3 12 8.6 0H22" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

const families: Record<SoundStyle, { title: string; character: string; description: string; icon: IconName; index: string }> = {
  soft: { title: 'Soft', character: 'Warm · airy · gentle', description: 'Rounded tones with room to breathe.', icon: 'wave', index: '01' },
  tactile: { title: 'Tactile', character: 'Dry · compact · percussive', description: 'A small, physical tick. Clear and direct.', icon: 'headphones', index: '02' },
  playful: { title: 'Playful', character: 'Bright · melodic · light', description: 'A little lift for the moments that matter.', icon: 'spark', index: '03' },
};
const cueNames: Record<SoundCue, string> = { success: 'Success', error: 'Error', complete: 'Completion', notification: 'Notification' };
const cueIcons: Record<SoundCue, IconName> = { success: 'check', error: 'close', complete: 'spark', notification: 'volume' };

function failureMessage(reason?: string) {
  if (reason === 'busy') return 'The previous sound is finishing. Try again.';
  if (reason === 'muted') return 'Muted. Unmute when you want to listen.';
  if (reason === 'unavailable' || reason === 'playback-failed') return 'Audio playback is unavailable in this browser.';
  if (reason === 'gesture-required') return 'Press Enable sounds to start listening.';
  if (reason === 'activation-rejected') return 'Audio couldn’t start. Try Enable sounds again.';
  return 'Audio is paused. Enable sounds to resume.';
}

function useSystemReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export default function App() {
  const [engine, setEngine] = useState(() => createSoundEngine({ style: 'soft', volume: 0.25, muted: false }));
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  const [choice, setChoice] = useState<Choice>('none');
  const [compareCue, setCompareCue] = useState<SoundCue>('success');
  const [audition, setAudition] = useState<{ style: SoundStyle; cue: SoundCue; duration: number } | null>(null);
  const [comparing, setComparing] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [message, setMessage] = useState('Sound off. Enable when you want to listen.');
  const [progress, setProgress] = useState(0);
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const reducedMotion = useSystemReducedMotion();
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const sequence = useRef(0);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const animationFrame = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const currentEngine = useRef(engine);
  currentEngine.current = engine;
  const canPlay = state.enabled && !state.muted && state.volume > 0;

  const cancelPlayback = useCallback((nextMessage?: string) => {
    sequence.current++;
    clearTimeout(finishTimer.current);
    clearTimeout(nextTimer.current);
    if (animationFrame.current !== undefined) cancelAnimationFrame(animationFrame.current);
    engine.stop();
    if (mounted.current) {
      setAudition(null);
      setComparing(false);
      setProgress(0);
      if (nextMessage) setMessage(nextMessage);
    }
  }, [engine]);

  useEffect(() => {
    mounted.current = true;
    if (engine.getState().status === 'disposed') {
      const previous = engine.getState();
      setEnabling(false);
      setMessage('Sound off. Enable when you want to listen.');
      setEngine(createSoundEngine({ style: previous.style, volume: previous.volume, muted: previous.muted }));
      return;
    }
    const visibility = () => { if (document.hidden) cancelPlayback('Playback stopped while this tab was hidden.'); };
    const pageHide = () => { cancelPlayback('Sound off. Enable when you want to listen.'); engine.disable(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pageHide);
    return () => {
      mounted.current = false;
      cancelPlayback();
      engine.dispose();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pageHide);
    };
  }, [cancelPlayback, engine]);

  useEffect(() => {
    if (state.status === 'suspended') cancelPlayback('Audio paused. Enable sounds to resume.');
    else if (!state.enabled || state.muted || state.volume === 0) cancelPlayback();
  }, [state.enabled, state.muted, state.volume, state.status, cancelPlayback]);

  function startMeter(duration: number, token: number) {
    setProgress(0);
    if (reducedRef.current) return;
    const started = performance.now();
    const update = () => {
      if (token !== sequence.current || !mounted.current || reducedRef.current) return;
      const percentage = Math.min(100, (performance.now() - started) / (duration * 1000) * 100);
      setProgress(percentage);
      if (percentage < 100) animationFrame.current = requestAnimationFrame(update);
    };
    animationFrame.current = requestAnimationFrame(update);
  }

  function playOne(style: SoundStyle, cue: SoundCue) {
    cancelPlayback();
    const token = sequence.current;
    const result = engine.play(cue, { style });
    if (!result.accepted) { setMessage(failureMessage(result.reason)); return; }
    setAudition({ style, cue, duration: result.duration });
    setMessage(`${families[style].title} · ${cueNames[cue]}`);
    startMeter(result.duration, token);
    finishTimer.current = setTimeout(() => {
      if (token !== sequence.current || !mounted.current) return;
      setAudition(null);
      setProgress(0);
      setMessage(`${families[style].title} ${cueNames[cue].toLowerCase()} finished. Ready for the next cue.`);
    }, result.duration * 1000 + 35);
  }

  function compareStyles() {
    cancelPlayback();
    const token = sequence.current;
    setComparing(true);
    const step = (index: number) => {
      if (token !== sequence.current || !mounted.current) return;
      const style = SOUND_STYLES[index];
      const result = engine.play(compareCue, { style });
      if (!result.accepted) { cancelPlayback(failureMessage(result.reason)); return; }
      setAudition({ style, cue: compareCue, duration: result.duration });
      setMessage(`Comparing ${cueNames[compareCue].toLowerCase()} · ${families[style].title} (${index + 1} of 3)`);
      startMeter(result.duration, token);
      finishTimer.current = setTimeout(() => {
        if (token !== sequence.current || !mounted.current) return;
        setAudition(null);
        setProgress(0);
        if (index === SOUND_STYLES.length - 1) {
          setComparing(false);
          setMessage('Comparison complete. Choose the style that feels right.');
        } else {
          setMessage(`Next: ${families[SOUND_STYLES[index + 1]].title}`);
          nextTimer.current = setTimeout(() => step(index + 1), 240);
        }
      }, result.duration * 1000 + 35);
    };
    step(0);
  }

  async function enableSounds() {
    cancelPlayback();
    setEnabling(true);
    const token = sequence.current;
    // Call synchronously in this trusted button event; never enable from an effect.
    const enabled = await engine.enable();
    if (!mounted.current || currentEngine.current !== engine) return;
    setEnabling(false);
    if (token !== sequence.current) return;
    setMessage(enabled ? 'Ready to listen. Choose a cue below.' : failureMessage(engine.getState().reason));
  }

  function chooseStyle(value: Choice) {
    setChoice(value);
    if (value === 'off') {
      cancelPlayback('Sound off. Your preference is Off.');
      engine.disable();
    } else {
      cancelPlayback();
      if (value !== 'none') engine.setStyle(value);
    }
  }

  const statusText = state.muted ? 'Muted. Unmute when you want to listen.' : state.volume === 0 ? 'Volume is 0%. Raise it to listen.' : message;

  return (
    <div className={`app ${dark ? 'theme-dark' : ''} ${reducedMotion ? 'reduce-motion' : ''}`}>
      <a className="skip-link" href="#listening">Skip to listening playground</a>
      <header className="site-header"><a className="brand" href="#"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /><i /></span>Sounds for Agents</a><div className="header-actions"><span className="header-caption">A small sound. A clear response.</span><button className="icon-button" type="button" aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`} onClick={() => setDark((value) => !value)}><Icon name={dark ? 'sun' : 'moon'} /></button><a className="github-link" href="https://github.com/thejjeanjjorge/sounds-for-agents" target="_blank" rel="noreferrer"><Icon name="github" /><span>GitHub</span></a></div></header>
      <main className="page-content">
        <section className="intro" aria-labelledby="intro-title"><span className="eyebrow">PURPOSEFUL SOUND FOR APPS</span><h1 id="intro-title">Let the moment<br /><span>have a little voice.</span></h1><div className="intro-bottom"><p>Three characters. Four useful cues.<br />Listen, compare, and choose how your app should sound.</p><span className="intro-note"><Icon name="headphones" size={15} /> Best with headphones, at a comfortable volume.</span></div></section>
        <section className="listening-section" id="listening" aria-labelledby="listening-title">
          <div className="section-heading"><div><span className="eyebrow">LISTEN BEFORE YOU CHOOSE</span><h2 id="listening-title">Find your app’s character</h2></div><span className={`session-badge ${state.enabled ? 'is-enabled' : ''}`}><span />{state.enabled ? 'Sounds enabled' : 'Sound off'}</span></div>
          <div className="listening-controls">
            <button className="button button-primary enable-button" type="button" disabled={enabling} onClick={state.enabled ? () => { cancelPlayback('Sound off. Enable when you want to listen.'); engine.disable(); } : enableSounds}><Icon name={state.enabled ? 'mute' : 'volume'} />{state.enabled ? 'Disable sounds' : enabling ? 'Enabling…' : 'Enable sounds'}</button>
            <label className="volume-control" htmlFor="volume"><span>Volume <output htmlFor="volume">{Math.round(state.volume * 100)}%</output></span><input id="volume" type="range" min="0" max="100" step="1" value={Math.round(state.volume * 100)} onChange={(event) => { const value = Number(event.target.value) / 100; if (value === 0) cancelPlayback(); engine.setVolume(value); }} /></label>
            <label className="mute-control"><input type="checkbox" checked={state.muted} onChange={(event) => { if (event.target.checked) cancelPlayback(); engine.setMuted(event.target.checked); }} /><span className="toggle-track" aria-hidden="true"><span /></span><span>Mute</span></label>
            <button className="button stop-button" type="button" disabled={!state.playing && !comparing && !audition} onClick={() => cancelPlayback('Playback stopped. Ready when you are.')}><Icon name="stop" size={14} /> Stop</button>
          </div>
          <div className={`player-status ${audition ? 'is-playing' : ''}`}><div className="player-status-top"><span className="player-symbol"><Icon name={audition ? 'wave' : state.muted ? 'mute' : 'headphones'} size={17} /></span><p role="status" aria-live="polite" aria-atomic="true">{statusText}</p><span className="player-duration">{audition ? `${audition.duration.toFixed(2)}s` : 'Original synthesized cues'}</span></div><div className="playback-track" aria-hidden="true"><span style={{ width: `${audition && reducedMotion ? 100 : progress}%` }} /></div></div>
          <div className="family-grid">{SOUND_STYLES.map((style) => <section className={`family-card ${audition?.style === style ? 'is-auditioning' : ''} ${choice === style ? 'is-chosen' : ''}`} key={style} aria-labelledby={`${style}-title`}><div className="family-top"><span className="family-number">{families[style].index}</span><span className="family-illustration"><Icon name={families[style].icon} size={35} /></span><span className="family-selected">{choice === style ? <><Icon name="check" size={12} /> Your choice</> : 'Sound family'}</span></div><h3 id={`${style}-title`}>{families[style].title}</h3><p className="family-character">{families[style].character}</p><p className="family-description">{families[style].description}</p><div className="cue-list">{SOUND_CUES.map((cue) => <button className="cue-button" key={cue} type="button" aria-label={`Play ${families[style].title} ${cueNames[cue].toLowerCase()}`} aria-pressed={audition?.style === style && audition.cue === cue} disabled={!canPlay} onClick={() => playOne(style, cue)}><span className="cue-icon"><Icon name={cueIcons[cue]} size={14} /></span><span>{cueNames[cue]}</span><span className="cue-duration">{getCueDuration(style, cue).toFixed(2)}s</span><Icon name="play" size={12} /></button>)}</div></section>)}</div>
          <p className="listening-footnote"><span /> No sound on load. Every cue starts with a button press.</p>
        </section>
        <section className="comparison-section" aria-labelledby="comparison-title"><div className="comparison-copy"><span className="eyebrow">THE SAME MOMENT, THREE WAYS</span><h2 id="comparison-title">Hear the difference</h2><p>Play one event through Soft, Tactile, and Playful.<br />A short pause gives each one room.</p></div><div className="comparison-actions"><label className="select-label" htmlFor="compare-cue">Event to compare<select id="compare-cue" value={compareCue} onChange={(event) => { cancelPlayback(); setCompareCue(event.target.value as SoundCue); }}>{SOUND_CUES.map((cue) => <option key={cue} value={cue}>{cueNames[cue]}</option>)}</select></label><button className="button button-secondary compare-button" type="button" disabled={!canPlay} onClick={compareStyles}><Icon name="play" size={15} />{comparing ? 'Restart comparison' : 'Compare styles'}</button><p className="comparison-order">Soft <span>→</span> Tactile <span>→</span> Playful</p></div></section>
        <section className="choice-section" aria-labelledby="choice-title"><div><span className="eyebrow">YOUR APP. YOUR CHOICE.</span><h2 id="choice-title">What feels right?</h2><p>Choose after listening. Apply it to an app when you ask.</p></div><div className="choice-controls"><label className="select-label" htmlFor="preferred-style">Preferred sound style<select id="preferred-style" value={choice} onChange={(event) => chooseStyle(event.target.value as Choice)}><option value="none">Choose a style</option>{SOUND_STYLES.map((style) => <option key={style} value={style}>{families[style].title}</option>)}<option value="off">Off — keep sound disabled</option></select></label><p className="choice-status" role="status">{choice === 'none' ? 'No style chosen yet.' : choice === 'off' ? 'Off selected. Sound is optional.' : `${families[choice].title} selected.`}</p></div></section>
      </main>
      <footer className="site-footer"><span>Sound adds a cue. The interface still tells the story.</span><a href="https://github.com/thejjeanjjorge/sounds-for-agents#readme" target="_blank" rel="noreferrer">Explore the framework <Icon name="arrow" size={13} /></a></footer>
    </div>
  );
}
