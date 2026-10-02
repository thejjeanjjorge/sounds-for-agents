import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function exampleStderr(file: string): string {
  return runPlan(fileURLToPath(new URL(`../examples/invalid/${file}`, import.meta.url))).stderr;
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

describe('plan validation messages', () => {
  it('says what a constant field must be instead of "equal to constant"', () => {
    expect(exampleStderr('default-on.json')).toContain('/defaults/enabled must be false');
    expect(exampleStderr('unconfirmed-choice.json')).toContain('/userChoice/confirmed must be true');
    expect(exampleStderr('default-on.json')).not.toContain('equal to constant');
  });

  it('names the style the plan chose when the recorded choice differs, without a vague then-schema line', () => {
    const stderr = exampleStderr('mismatched-choice.json');
    expect(stderr).toContain('/userChoice/style must be "soft"');
    expect(stderr).not.toContain('"then" schema');
  });

  it('keeps naming a missing required field', () => {
    expect(exampleStderr('missing-visible-feedback.json'))
      .toContain("/feedback/0 must have required property 'visibleFeedback'");
  });

  it('lists the allowed values for a field with a fixed vocabulary', () => {
    const plan = JSON.parse(readFileSync(new URL('../examples/soft-plan.json', import.meta.url), 'utf8'));
    plan.feedback[0].cue = 'tap';
    const path = join(mkdtempSync(join(tmpdir(), 'sounds-plan-')), 'plan.json');
    writeFileSync(path, JSON.stringify(plan));
    const result = runPlan(path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('/feedback/0/cue must be one of "success", "error", "complete", "notification"');
  });
});
