// @vitest-environment jsdom
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundsProvider, SoundControls, useSounds } from '../src/react';
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
