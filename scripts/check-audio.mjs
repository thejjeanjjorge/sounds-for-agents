import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

// A native, silent computation test. No user browser or app UI is operated.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distribution = resolve(repository, 'dist');
const artifactDirectory = resolve(repository, '.artifacts', 'audio-check');
await mkdir(artifactDirectory, { recursive: true });
const previousWorkingDirectory = process.cwd();
process.chdir(artifactDirectory); // Chromium's Windows diagnostics stay ignored.

const core = await import(pathToFileURL(resolve(distribution, 'core/index.js')).href);
assert.deepEqual(core.SOUND_STYLES, ['soft', 'tactile', 'playful']);
assert.deepEqual(core.SOUND_CUES, ['success', 'error', 'complete', 'notification']);
assert.throws(() => core.createSoundEngine({}), /invalid-style/, 'A style choice is required');
const serverEngine = core.createSoundEngine({ style: 'soft' });
assert.equal(serverEngine.getState().enabled, false, 'Server-side construction remains disabled');
assert.equal(serverEngine.getState().volume, 0.25, 'Default volume is a quarter');
assert.equal(serverEngine.play('success').reason, 'not-enabled', 'Ordinary server-side playback remains disabled');
serverEngine.dispose();

const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    if (path === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><title>Silent native audio test</title>');
      return;
    }
    const target = resolve(distribution, `.${path}`);
    if (!target.startsWith(distribution + sep)) { response.writeHead(403); response.end(); return; }
    const contents = await readFile(target);
    response.writeHead(200, { 'Content-Type': extname(target) === '.js' ? 'text/javascript' : 'application/octet-stream' });
    response.end(contents);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--disable-logging'] });
  const page = await browser.newPage();
  await page.goto(origin);
  const guards = await page.evaluate(async () => {
    const counters = { live: 0, offline: 0 };
    const platform = globalThis;
    for (const [name, category] of [['AudioContext', 'live'], ['OfflineAudioContext', 'offline']]) {
      const Original = platform[name];
      platform[name] = new Proxy(Original, {
        construct(target, args, newTarget) { counters[category]++; return Reflect.construct(target, args, newTarget); },
      });
    }
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false } });
    const audio = await import('/core/index.js');
    const afterImport = { ...counters };
    const engine = audio.createSoundEngine({ style: 'soft' });
    const initial = engine.getState();
    const stableSnapshot = engine.getState() === initial && Object.isFrozen(initial);
    engine.setVolume(0.4);
    engine.setMuted(true);
    engine.setMuted(false);
    engine.setStyle('playful');
    const invalid = engine.play('unknown');
    const invalidStyle = engine.play('success', { style: 'unknown' });
    const disabled = engine.play('success');
    const enabledWithoutGesture = await engine.enable();
    let rejectedRender;
    try { await audio.renderCue('unknown', 'success'); } catch (error) { rejectedRender = error.message; }
    engine.dispose();
    platform.__nativeAudioCounters = counters;
    return { afterImport, afterGuards: { ...counters }, stableSnapshot, initial, invalid, invalidStyle, disabled, enabledWithoutGesture, rejectedRender };
  });
  assert.deepEqual(guards.afterImport, { live: 0, offline: 0 }, 'Import creates no contexts');
  assert.deepEqual(guards.afterGuards, { live: 0, offline: 0 }, 'Constructing, changing preferences, and rejected calls create no contexts');
  assert(guards.stableSnapshot, 'State is a stable frozen snapshot');
  assert.equal(guards.initial.enabled, false);
  assert.equal(guards.initial.volume, 0.25);
  assert.equal(guards.invalid.reason, 'invalid-cue');
  assert.equal(guards.invalidStyle.reason, 'invalid-style');
  assert.equal(guards.disabled.reason, 'not-enabled');
  assert.equal(guards.enabledWithoutGesture, false);
  assert.match(guards.rejectedRender, /invalid-style/);

  const rendered = await page.evaluate(async () => {
    const audio = await import('/core/index.js');
    const metrics = [], differences = [], buffers = new Map();
    for (const cue of audio.SOUND_CUES) {
      for (const style of audio.SOUND_STYLES) {
        const buffer = await audio.renderCue(style, cue, { sampleRate: 48000 });
        const samples = buffer.getChannelData(0);
        let peak = 0, energy = 0, nonzero = 0, finite = true, maxStep = 0, tailPeak = 0;
        for (let index = 0; index < samples.length; index++) {
          const value = samples[index];
          finite &&= Number.isFinite(value);
          peak = Math.max(peak, Math.abs(value));
          energy += value * value;
          if (Math.abs(value) > 1e-8) nonzero++;
          if (index > 0) maxStep = Math.max(maxStep, Math.abs(value - samples[index - 1]));
          if (index >= samples.length - 960) tailPeak = Math.max(tailPeak, Math.abs(value));
        }
        buffers.set(`${style}:${cue}`, samples.slice());
        metrics.push({ style, cue, duration: buffer.duration, liveDuration: audio.getCueDuration(style, cue), sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, finite, peak, rms: Math.sqrt(energy / samples.length), nonzero, maxStep, tailPeak });
      }
    }
    for (const cue of audio.SOUND_CUES) {
      for (let left = 0; left < audio.SOUND_STYLES.length; left++) {
        for (let right = left + 1; right < audio.SOUND_STYLES.length; right++) {
          const first = audio.SOUND_STYLES[left], second = audio.SOUND_STYLES[right];
          const a = buffers.get(`${first}:${cue}`), b = buffers.get(`${second}:${cue}`);
          let difference = 0;
          const length = Math.max(a.length, b.length);
          for (let index = 0; index < length; index++) difference += ((a[index] || 0) - (b[index] || 0)) ** 2;
          differences.push({ cue, first, second, rmsDifference: Math.sqrt(difference / length) });
        }
      }
    }
    const repeats = [];
    for (const cue of ['success', 'complete']) {
      const repeat = await audio.renderCue('tactile', cue);
      const original = buffers.get(`tactile:${cue}`);
      let maxDifference = 0;
      repeat.getChannelData(0).forEach((value, index) => { maxDifference = Math.max(maxDifference, Math.abs(value - original[index])); });
      repeats.push({ cue, maxDifference });
    }
    const lowRate = await audio.renderCue('soft', 'success', { sampleRate: 1 });
    const highRate = await audio.renderCue('soft', 'success', { sampleRate: 1000000 });
    return { metrics, differences, repeats, lowRate: lowRate.sampleRate, highRate: highRate.sampleRate, counters: { ...globalThis.__nativeAudioCounters } };
  });

  assert.equal(rendered.metrics.length, 12);
  for (const cue of rendered.metrics) {
    const name = `${cue.style}:${cue.cue}`;
    assert(cue.finite, `${name}: all PCM samples are finite`);
    assert.equal(cue.channels, 1, `${name}: mono output`);
    assert.equal(cue.sampleRate, 48000);
    assert(cue.duration > 0.2 && cue.duration < 1, `${name}: finite sub-second cue`);
    assert(Math.abs(cue.duration - cue.liveDuration - 0.01) <= 1 / 48000, `${name}: live duration and render tail agree`);
    assert(cue.nonzero > 1000, `${name}: audible nonzero signal`);
    assert(cue.peak > 0 && cue.peak < 1, `${name}: no digital clipping`);
    assert(cue.maxStep <= 0.025, `${name}: no single-sample attack spikes`);
    assert.equal(cue.tailPeak, 0, `${name}: silent final 20ms`);
  }
  for (const pair of rendered.differences) assert(pair.rmsDifference > 0.005, `${pair.cue}: ${pair.first} differs from ${pair.second}`);
  for (const repeat of rendered.repeats) assert(repeat.maxDifference <= 1e-7, `${repeat.cue}: stable within Float32 mixer precision`);
  assert.equal(rendered.lowRate, 8000, 'Low sample rates are clamped');
  assert.equal(rendered.highRate, 96000, 'High sample rates are clamped');
  assert.equal(rendered.counters.live, 0, 'Native PCM checks never create a live AudioContext');

  console.log('PASS: SSR-safe core import; lazy live contexts; rejected playback and no-gesture enable.');
  console.table(rendered.metrics.map(({ style, cue, duration, peak, rms, maxStep }) => ({ style, cue, duration: duration.toFixed(6), peak: peak.toFixed(6), rms: rms.toFixed(6), maxStep: maxStep.toFixed(6) })));
  console.log(`PASS: all 12 original native cues are finite, nonzero, unclipped, click-bounded, and end silently. ${rendered.differences.length} distinct family pairs; stable repeats; sample-rate clamps.`);
  console.log(`Native context counts: ${JSON.stringify(rendered.counters)}. No audible playback or UI interactions.`);
} finally {
  if (browser) await browser.close();
  await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  process.chdir(previousWorkingDirectory);
}
