import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  SOUND_STYLES, SOUND_CUES, DEFAULT_SOUND_PREFERENCES, createSoundEngine, getCueDuration, loadSoundPreferences, renderCue,
  saveSoundPreferences,
} from '../dist/core/index.js';
import { readPlan, soundPlanSchema, validatePlan } from './plan-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(readFileSync(join(root, 'sounds.catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.equal(catalog.package, manifest.name, 'Catalog package name drifted');
assert.equal(catalog.packageVersion, manifest.version, 'Catalog package version drifted');
assert.deepEqual(catalog.styles.map(style => style.id), [...SOUND_STYLES], 'Catalog styles differ from core');
assert.deepEqual(catalog.cues.map(cue => cue.id), [...SOUND_CUES], 'Catalog cues differ from core');
assert.deepEqual(catalog.defaults, { enabled: false, volume: 0.25, muted: false });
const engine = createSoundEngine({ style: SOUND_STYLES[0] });
const state = engine.getState();
assert.deepEqual({ enabled: state.enabled, volume: state.volume, muted: state.muted }, catalog.defaults);
engine.dispose();
assert.deepEqual({ ...DEFAULT_SOUND_PREFERENCES }, { volume: catalog.defaults.volume, muted: catalog.defaults.muted },
  'Saved-preference defaults differ from the catalog');
assert.deepEqual(soundPlanSchema.properties.selectedStyle.enum, [...SOUND_STYLES, 'off']);
assert.deepEqual(soundPlanSchema.properties.feedback.items.properties.cue.enum, [...SOUND_CUES]);
assert.deepEqual(soundPlanSchema.properties.controls.anyOf[0].required, catalog.controls);
for (const key of ['enabled', 'volume', 'muted']) {
  assert.equal(soundPlanSchema.properties.defaults.properties[key].const, catalog.defaults[key]);
}
assert.equal(soundPlanSchema.properties.userChoice.properties.confirmed.const, true);
for (const api of [createSoundEngine, getCueDuration, renderCue, loadSoundPreferences, saveSoundPreferences]) {
  assert.equal(typeof api, 'function');
}
let validExamples = 0;
let invalidExamples = 0;
for (const file of readdirSync(join(root, 'examples'))) {
  if (!file.endsWith('.json')) continue;
  const errors = validatePlan(readPlan(join(root, 'examples', file)));
  assert.deepEqual(errors, [], `${file}: ${errors.join('; ')}`);
  validExamples++;
}
for (const file of readdirSync(join(root, 'examples/invalid'))) {
  if (!file.endsWith('.json')) continue;
  assert.ok(validatePlan(readPlan(join(root, 'examples/invalid', file))).length > 0, `${file} unexpectedly passed`);
  invalidExamples++;
}
assert.ok(validExamples > 0 && invalidExamples > 0, 'Keep positive and negative examples');
const skill = readFileSync(join(root, catalog.skill), 'utf8');
assert.ok(skill.startsWith('---\n') || skill.startsWith('---\r\n'), 'Skill requires YAML frontmatter');
console.log(`Agent contract passed: ${catalog.styles.length} styles, ${catalog.cues.length} cues, ${validExamples} valid and ${invalidExamples} invalid examples. Recorded consent is not verified.`);
