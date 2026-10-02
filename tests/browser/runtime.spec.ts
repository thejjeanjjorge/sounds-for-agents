import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { SoundEngine } from '../../src/core';

// Native API computations only. There are no clicks, input actions, selectors,
// screenshots, app pages, or other user UI automation in this suite.
const distribution = resolve(import.meta.dirname, '../../dist');
let server: Server;
let origin: string;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      if (pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Native audio runtime computation</title>'); return; }
      const target = resolve(distribution, `.${pathname}`);
      if (!target.startsWith(distribution + sep)) { response.writeHead(403); response.end(); return; }
      const source = await readFile(target);
      response.writeHead(200, { 'Content-Type': extname(target) === '.js' ? 'text/javascript' : 'application/octet-stream' });
      response.end(source);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Native test server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { if (server) await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept())); });

test('native live engine stays lazy and blocks inactive user activation', async ({ page }) => {
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    let created = 0;
    const Original = AudioContext;
    window.AudioContext = new Proxy(Original, { construct(target, args, newTarget) { created++; return Reflect.construct(target, args, newTarget); } });
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false } });
    const modulePath = '/core/index.js';
    const core = await import(modulePath);
    const afterImport = created;
    const engine = core.createSoundEngine({ style: 'soft' }) as SoundEngine;
    engine.setStyle('playful'); engine.setVolume(0.3); engine.setMuted(true); engine.setMuted(false);
    const play = engine.play('success');
    const enabled = await engine.enable();
    const reason = engine.getState().reason;
    engine.dispose();
    return { afterImport, created, play, enabled, reason };
  });
  expect(result.afterImport).toBe(0);
  expect(result.created).toBe(0);
  expect(result.play).toMatchObject({ accepted: false, reason: 'not-enabled' });
  expect(result.enabled).toBe(false);
  expect(result.reason).toBe('gesture-required');
});

test('native active cues do not stack; stop, mute, zero volume, disable and disposal release them', async ({ page }) => {
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    let context: AudioContext | undefined;
    const Original = AudioContext;
    window.AudioContext = new Proxy(Original, { construct(target, args, newTarget) { context = Reflect.construct(target, args, newTarget) as AudioContext; return context; } });
    // Explicitly model activation for a silent API lifecycle test. Chromium's
    // --mute-audio launch flag prevents hardware playback.
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
    const modulePath = '/core/index.js';
    const core = await import(modulePath);
    const engine = core.createSoundEngine({ style: 'tactile', volume: 0.4 }) as SoundEngine;
    const enabled = await engine.enable();
    const accepted = engine.play('complete');
    const second = engine.play('success');
    await new Promise<void>((accept) => setTimeout(accept, 40));
    engine.stop();
    const stopped = engine.getState();
    const afterStop = engine.play('success');
    engine.setMuted(true);
    const muted = engine.getState();
    const deniedMuted = engine.play('success');
    engine.setMuted(false);
    const remembered = engine.getState().volume;
    const afterUnmute = engine.play('success');
    engine.setVolume(0);
    const zero = engine.getState();
    const deniedZero = engine.play('success');
    engine.setVolume(0.4);
    const beforeDisable = engine.play('success');
    engine.disable();
    const disabled = engine.getState();
    const deniedDisabled = engine.play('success');
    const reenabled = await engine.enable();
    const beforeDispose = engine.play('success');
    engine.dispose();
    await new Promise<void>((accept) => setTimeout(accept, 80));
    return { enabled, accepted, second, stopped, afterStop, muted, deniedMuted, remembered, afterUnmute, zero, deniedZero, beforeDisable, disabled, deniedDisabled, reenabled, beforeDispose, disposed: engine.getState(), deniedDisposed: engine.play('success'), contextState: context?.state };
  });
  expect(result.enabled).toBe(true);
  expect(result.accepted.accepted).toBe(true);
  expect(result.second).toMatchObject({ accepted: false, reason: 'busy' });
  expect(result.stopped.playing).toBe(false);
  expect(result.afterStop.accepted).toBe(true);
  expect(result.muted.playing).toBe(false);
  expect(result.deniedMuted).toMatchObject({ accepted: false, reason: 'muted' });
  expect(result.remembered).toBe(0.4);
  expect(result.afterUnmute.accepted).toBe(true);
  expect(result.zero.playing).toBe(false);
  expect(result.deniedZero).toMatchObject({ accepted: false, reason: 'muted' });
  expect(result.beforeDisable.accepted).toBe(true);
  expect(result.disabled.enabled).toBe(false);
  expect(result.disabled.playing).toBe(false);
  expect(result.deniedDisabled).toMatchObject({ accepted: false, reason: 'not-enabled' });
  expect(result.reenabled).toBe(true);
  expect(result.beforeDispose.accepted).toBe(true);
  expect(result.disposed.status).toBe('disposed');
  expect(result.deniedDisposed).toMatchObject({ accepted: false, reason: 'disposed' });
  expect(result.contextState).toBe('closed');
});

test('context interruption cancels a cue and requires a fresh enable even after browser resume', async ({ page }) => {
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    let context: AudioContext | undefined;
    const Original = AudioContext;
    window.AudioContext = new Proxy(Original, { construct(target, args, newTarget) { context = Reflect.construct(target, args, newTarget) as AudioContext; return context; } });
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
    const modulePath = '/core/index.js';
    const core = await import(modulePath);
    const engine = core.createSoundEngine({ style: 'soft' }) as SoundEngine;
    await engine.enable();
    const play = engine.play('complete');
    await context!.suspend();
    await new Promise<void>((accept) => setTimeout(accept, 30));
    const suspended = engine.getState();
    await context!.resume();
    await new Promise<void>((accept) => setTimeout(accept, 30));
    const resumed = engine.getState();
    const denied = engine.play('success');
    const reenabled = await engine.enable();
    const restored = engine.getState();
    engine.dispose();
    return { play, suspended, resumed, denied, reenabled, restored };
  });
  expect(result.play.accepted).toBe(true);
  expect(result.suspended.status).toBe('suspended');
  expect(result.suspended.enabled).toBe(false);
  expect(result.suspended.playing).toBe(false);
  expect(result.resumed.enabled).toBe(false);
  expect(result.resumed.playing).toBe(false);
  expect(result.denied).toMatchObject({ accepted: false, reason: 'suspended' });
  expect(result.reenabled).toBe(true);
  expect(result.restored.enabled).toBe(true);
  expect(result.restored.playing).toBe(false);
});
