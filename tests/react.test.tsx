// @vitest-environment jsdom
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundsProvider, SoundControls, useSoundPlayer, useSounds, type SoundPlayer } from '../src/react';
import { installMockAudio } from './helpers/mock-audio';

let audio: ReturnType<typeof installMockAudio>;
beforeEach(() => { audio = installMockAudio(); });
afterEach(() => { cleanup(); audio.restore(); vi.useRealTimers(); });

function TestAction() {
  const sounds = useSounds();
  return <>
    <output data-testid="state">{sounds.style}:{sounds.status}:{sounds.volume}</output>
    <button onClick={() => sounds.play('success')}>Save result</button>
  </>;
}

describe('React integration', () => {
  it('server-renders and mounts silently without a live audio context', () => {
    const app = <SoundsProvider style="soft"><SoundControls /><TestAction /></SoundsProvider>;
    expect(renderToString(app)).toContain('Sound off.');
    render(app);
    fireEvent.click(screen.getByText('Save result'));
    expect(audio.contexts).toHaveLength(0);
    expect(screen.getByTestId('state').textContent).toBe('soft:disabled:0.25');
  });

  it('survives Strict Mode effect replay, enables deliberately, and closes on unmount', async () => {
    const view = render(<StrictMode><SoundsProvider style="tactile"><SoundControls /><TestAction /></SoundsProvider></StrictMode>);
    expect(audio.contexts).toHaveLength(0);
    audio.setActivation(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable sounds' })); });
    expect(screen.getByRole('button', { name: 'Disable sounds' })).toBeTruthy();
    expect(screen.getByTestId('state').textContent).toBe('tactile:ready:0.25');
    expect(audio.contexts).toHaveLength(1);
    fireEvent.click(screen.getByText('Save result'));
    expect(screen.getByTestId('state').textContent).toBe('tactile:playing:0.25');
    view.unmount();
    expect(audio.contexts[0].closeCalls).toBe(1);
  });

  it('mutes, retains volume, stops, and disables through native controls', async () => {
    render(<SoundsProvider style="playful"><SoundControls /><TestAction /></SoundsProvider>);
    audio.setActivation(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable sounds' })); });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
    fireEvent.click(screen.getByText('Save result'));
    fireEvent.click(screen.getByRole('button', { name: 'Stop sound' }));
    expect(screen.getByTestId('state').textContent).toBe('playful:ready:0.4');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mute' }));
    expect(screen.getByTestId('state').textContent).toBe('playful:muted:0.4');
    fireEvent.click(screen.getByText('Save result'));
    expect(screen.getByTestId('state').textContent).toBe('playful:muted:0.4');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mute' }));
    expect(screen.getByRole('slider').getAttribute('value')).toBe('40');
    fireEvent.click(screen.getByRole('button', { name: 'Disable sounds' }));
    expect(screen.getByTestId('state').textContent).toBe('playful:disabled:0.4');
  });

  it('preserves consumer input state when the chosen style changes', () => {
    const view = render(<SoundsProvider style="soft"><input aria-label="SQL editor" defaultValue="SELECT *" /><TestAction /></SoundsProvider>);
    const editor = screen.getByRole('textbox', { name: 'SQL editor' });
    fireEvent.change(editor, { target: { value: 'SELECT name FROM people' } });
    view.rerender(<SoundsProvider style="tactile"><input aria-label="SQL editor" defaultValue="SELECT *" /><TestAction /></SoundsProvider>);
    expect(screen.getByRole('textbox', { name: 'SQL editor' })).toBe(editor);
    expect((editor as HTMLInputElement).value).toBe('SELECT name FROM people');
    expect(screen.getByTestId('state').textContent).toBe('tactile:disabled:0.25');
    expect(audio.contexts).toHaveLength(0);
  });

  it('reports unavailable activation without treating playback as success', async () => {
    render(<SoundsProvider style="soft"><SoundControls /></SoundsProvider>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable sounds' })); });
    expect(screen.getByRole('status').textContent).toContain('could not start');
    expect(audio.contexts).toHaveLength(0);
  });
});

function PlayerProbe({ onRender }: { onRender: (player: SoundPlayer) => void }) {
  onRender(useSoundPlayer());
  return null;
}

describe('useSoundPlayer', () => {
  it('keeps one player as sound state changes, so components that only play cues do not re-render', async () => {
    const seen: SoundPlayer[] = [];
    render(<SoundsProvider style="soft"><SoundControls /><PlayerProbe onRender={player => seen.push(player)} /></SoundsProvider>);
    audio.setActivation(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable sounds' })); });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mute' }));
    expect(screen.getByRole('status').textContent).toBe('Sound muted.');
    // useSounds() consumers re-rendered for every change above; the probe rendered exactly once.
    expect(seen).toHaveLength(1);
  });

  it('plays through the live engine, including after Strict Mode replaces it', async () => {
    let player!: SoundPlayer;
    render(<StrictMode><SoundsProvider style="playful"><SoundControls /><PlayerProbe onRender={next => { player = next; }} /></SoundsProvider></StrictMode>);
    const before = player;
    expect(player.play('success')).toMatchObject({ accepted: false, reason: 'not-enabled' });
    audio.setActivation(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable sounds' })); });
    expect(player).toBe(before);
    let result: ReturnType<SoundPlayer['play']> | undefined;
    act(() => { result = player.play('success'); });
    expect(result?.accepted).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Playing sound.');
    act(() => { player.stop(); });
    expect(screen.getByRole('status').textContent).toBe('Sound enabled.');
  });

  it('requires a provider, like useSounds', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<PlayerProbe onRender={() => {}} />)).toThrow('useSoundPlayer must be used inside SoundsProvider.');
    quiet.mockRestore();
  });
});

describe('SoundControls hooks for apps', () => {
  it('marks each control by name so CSS does not depend on element order', async () => {
    render(<SoundsProvider style="soft"><SoundControls /></SoundsProvider>);
    const group = screen.getByRole('group', { name: 'Sound controls' });
    for (const name of ['toggle', 'mute', 'volume-label', 'volume', 'stop', 'status']) {
      expect(group.querySelector(`[data-sound-control="${name}"]`), name).not.toBeNull();
    }
    const toggle = group.querySelector('[data-sound-control="toggle"]')!;
    expect(group.getAttribute('data-sound-status')).toBe('disabled');
    expect(toggle.getAttribute('data-sound-enabled')).toBe('false');
    audio.setActivation(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable sounds' })); });
    expect(group.getAttribute('data-sound-status')).toBe('ready');
    expect(toggle.getAttribute('data-sound-enabled')).toBe('true');
  });

  it('tells the app once when the Enable sounds button succeeds, and not when audio could not start', async () => {
    const onEnabled = vi.fn();
    render(<SoundsProvider style="soft"><SoundControls onEnabled={onEnabled} /></SoundsProvider>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable sounds' })); });
    expect(onEnabled).not.toHaveBeenCalled();
    audio.setActivation(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable sounds' })); });
    expect(onEnabled).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Disable sounds' }));
    expect(onEnabled).toHaveBeenCalledTimes(1);
    // The callback is an app hook, not a DOM attribute.
    expect(screen.getByRole('group').hasAttribute('onenabled')).toBe(false);
  });

  it('lets the app play a confirmation cue from onEnabled, because the engine is live by then', async () => {
    function Confirm() {
      const player = useSoundPlayer();
      return <SoundControls onEnabled={() => player.play('notification')} />;
    }
    render(<SoundsProvider style="tactile"><Confirm /></SoundsProvider>);
    audio.setActivation(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable sounds' })); });
    expect(screen.getByRole('status').textContent).toBe('Playing sound.');
  });
});
