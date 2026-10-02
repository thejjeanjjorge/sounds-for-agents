import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const validExamples = ['soft-plan.json', 'off-plan.json'];
const invalidExamples = [
  'unconfirmed-choice.json',
  'default-on.json',
  'missing-visible-feedback.json',
  'mismatched-choice.json',
];

function runPlan(path: string) {
  const result = spawnSync(process.execPath, ['scripts/validate-plan.mjs', path], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

describe('sound integration plan CLI', () => {
  for (const file of validExamples) {
    it(`accepts ${file}`, () => {
      const path = fileURLToPath(new URL(`../examples/${file}`, import.meta.url));
      expect(runPlan(path).status).toBe(0);
    });
  }
  for (const file of invalidExamples) {
    it(`rejects ${file}`, () => {
      const path = fileURLToPath(new URL(`../examples/invalid/${file}`, import.meta.url));
      expect(runPlan(path).status).toBe(1);
    });
  }
  it('requires an input plan', () => {
    expect(spawnSync(process.execPath, ['scripts/validate-plan.mjs'], { encoding: 'utf8' }).status).toBe(1);
  });
  it('fails for a missing file rather than claiming validation', () => {
    expect(runPlan('examples/does-not-exist.json').status).toBe(1);
  });
});
