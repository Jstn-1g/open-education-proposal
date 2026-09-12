// Plain activity data only. Review status belongs to the application, never a recipe.
export const MAX_RECIPE_BYTES = 32 * 1024;
const encoder = new TextEncoder();
const recipeFields = ['schemaVersion', 'template', 'templateVersion', 'id', 'title', 'author', 'license', 'attribution', 'summary', 'goal', 'prerequisites', 'steps'];
const stepFields = ['id', 'prompt', 'pieces', 'hint'];
const byteLength = text => encoder.encode(text).byteLength;

function fail(message) { throw new Error(message); }

function record(input, fields, label) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    fail(`${label} must be a plain JSON object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) {
    fail(`${label} must contain exactly these fields: ${fields.join(', ')}.`);
  }
  const values = Object.create(null);
  for (const key of fields) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      fail(`${label} must contain ordinary JSON values, not accessors or hidden fields.`);
    }
    values[key] = descriptor.value;
  }
  return values;
}

function list(input, min, max, label) {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype
      || input.length < min || input.length > max) {
    fail(`${label} must be an array with ${min}–${max} items.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== input.length + 1) {
    fail(`${label} must be a complete JSON array without extra fields.`);
  }
  return Array.from({length: input.length}, (_, index) => {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      fail(`${label} must be a complete JSON array without accessors.`);
    }
    return descriptor.value;
  });
}

function text(input, min, max, label, multiline = false) {
  if (typeof input !== 'string') fail(`${label} must be text.`);
  if (input.length > MAX_RECIPE_BYTES || byteLength(input) > MAX_RECIPE_BYTES) {
    fail('The recipe must be no larger than 32 KiB of UTF-8 JSON.');
  }
  const value = multiline ? input.replace(/\r\n/g, '\n') : input;
  if (/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(value)
      || (!multiline && /[\n\u2028\u2029]/u.test(value))) {
    fail(`${label} contains unsupported control characters or line breaks.`);
  }
  const characters = [...value];
  if (characters.some(character => {
    const code = character.codePointAt(0);
    return code >= 0xD800 && code <= 0xDFFF;
  })) fail(`${label} contains incomplete Unicode text.`);
  const normalized = value.trim();
  const length = [...normalized].length;
  if (length < min || length > max) fail(`${label} must contain ${min}–${max} characters.`);
  return normalized;
}

function slug(input, label) {
  const value = text(input, 1, 64, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    fail(`${label} must use lowercase letters or digits separated by single hyphens.`);
  }
  return value;
}

function solvable(pieces) {
  const reachable = new Set([0]);
  for (const piece of pieces) {
    for (const sum of [...reachable]) if (sum + piece <= 8) reachable.add(sum + piece);
  }
  return reachable.has(8);
}

export function validateRecipe(input) {
  const raw = record(input, recipeFields, 'Recipe');
  if (raw.schemaVersion !== 1 || raw.template !== 'fraction-bridge' || raw.templateVersion !== 1) {
    fail('Use schemaVersion 1, template "fraction-bridge", and templateVersion 1.');
  }
  if (raw.license !== 'CC-BY-4.0') fail('This recipe format requires the CC-BY-4.0 content license.');
  const ids = new Set();
  const rawSteps = [];
  const steps = list(raw.steps, 1, 5, 'Steps').map((inputStep, index) => {
    const label = `Step ${index + 1}`;
    const step = record(inputStep, stepFields, label);
    const id = slug(step.id, `${label} ID`);
    if (ids.has(id)) fail('Every step must have a different ID.');
    ids.add(id);
    const prompt = text(step.prompt, 1, 180, `${label} prompt`);
    const pieces = list(step.pieces, 2, 12, `${label} pieces`);
    if (pieces.some(piece => !Number.isInteger(piece) || ![4, 2, 1].includes(piece))) {
      fail(`${label} pieces must be whole-number units: 4 for a half, 2 for a quarter, or 1 for an eighth.`);
    }
    if (!solvable(pieces)) fail(`${label} needs enough suitable pieces to fill one whole bridge (8 units).`);
    const hint = text(step.hint, 0, 240, `${label} hint`, true);
    rawSteps.push({...step, pieces});
    return {id, prompt, pieces, hint};
  });
  const recipe = {
    schemaVersion: 1,
    template: 'fraction-bridge',
    templateVersion: 1,
    id: slug(raw.id, 'Recipe ID'),
    title: text(raw.title, 1, 80, 'Title'),
    author: text(raw.author, 1, 80, 'Author'),
    license: 'CC-BY-4.0',
    attribution: text(raw.attribution, 1, 600, 'Attribution', true),
    summary: text(raw.summary, 1, 240, 'Summary', true),
    goal: text(raw.goal, 1, 240, 'Goal', true),
    prerequisites: text(raw.prerequisites, 0, 240, 'Prerequisites', true),
    steps,
  };
  // Serialize only inspected data copies, never a caller's object or toJSON method.
  if (byteLength(JSON.stringify({...raw, steps: rawSteps})) > MAX_RECIPE_BYTES) {
    fail('The recipe must be no larger than 32 KiB of UTF-8 JSON.');
  }
  return recipe;
}

export function parseRecipe(input) {
  if (typeof input !== 'string') fail('Choose a JSON recipe file containing text.');
  if (input.length > MAX_RECIPE_BYTES || byteLength(input) > MAX_RECIPE_BYTES) {
    fail('The recipe must be no larger than 32 KiB of UTF-8 JSON.');
  }
  let parsed;
  try { parsed = JSON.parse(input); }
  catch { fail('The file is not valid JSON. Check its quotes, commas, and brackets.'); }
  // JSON.parse keeps only the last duplicate key. Reject that ambiguity instead.
  // Scan already valid, bounded JSON iteratively so deep input cannot recurse here.
  const containers = [];
  for (const [token] of input.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],]/g)) {
    if (token === '{') containers.push({keys: new Set(), expectingKey: true});
    else if (token === '[') containers.push(null);
    else if (token === '}' || token === ']') containers.pop();
    else {
      const container = containers.at(-1);
      if (token === ',') { if (container) container.expectingKey = true; }
      else if (container?.expectingKey) {
        const key = JSON.parse(token);
        if (container.keys.has(key)) fail('The recipe JSON repeats a field. Keep each field only once.');
        container.keys.add(key);
        container.expectingKey = false;
      }
    }
  }
  return validateRecipe(parsed);
}

export function serializeRecipe(input) {
  return JSON.stringify(validateRecipe(input), null, 2) + '\n';
}
