import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

export const soundPlanSchema = JSON.parse(
  readFileSync(new URL('../schemas/sound-plan.schema.json', import.meta.url), 'utf8'),
);
const validateSchema = new Ajv({ allErrors: true, strict: true }).compile(soundPlanSchema);

/** Says what a field must be, not only that it differs: Ajv's own wording for a constant is "must be equal to constant". */
function describeSchemaError(error) {
  const path = error.instancePath || '/';
  if (error.keyword === 'const') return `${path} must be ${JSON.stringify(error.params.allowedValue)}`;
  if (error.keyword === 'enum') {
    return `${path} must be one of ${error.params.allowedValues.map(value => JSON.stringify(value)).join(', ')}`;
  }
  return `${path} ${error.message}`;
}

/**
 * Checks the recorded plan and vocabulary. A passing result does not prove
 * human consent or authorize consuming-app edits.
 */
export function validatePlan(plan) {
  if (!validateSchema(plan)) {
    return validateSchema.errors
      // A failed if/then only repeats the specific error reported just before it.
      .filter(error => error.keyword !== 'if')
      .map(describeSchemaError);
  }
  const errors = [];
  const seen = new Set();
  if (plan.userChoice.evidence !== undefined && !plan.userChoice.evidence.trim()) {
    errors.push('/userChoice/evidence must contain text when provided');
  }
  if (plan.controls !== null) {
    for (const [name, target] of Object.entries(plan.controls)) {
      if (!target.trim()) errors.push(`/controls/${name} must identify a control`);
    }
  }
  for (const [index, feedback] of plan.feedback.entries()) {
    for (const field of ['id', 'target', 'trigger', 'visibleFeedback']) {
      if (!feedback[field].trim()) errors.push(`/feedback/${index}/${field} must contain text`);
    }
    const id = feedback.id.trim();
    if (seen.has(id)) errors.push(`/feedback/${index}/id duplicates ${JSON.stringify(id)}`);
    seen.add(id);
  }
  for (const [index, note] of (plan.notes ?? []).entries()) {
    if (!note.trim()) errors.push(`/notes/${index} must contain text`);
  }
  return errors;
}

export function readPlan(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
