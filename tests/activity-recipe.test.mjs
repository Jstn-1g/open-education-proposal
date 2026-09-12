import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_RECIPE_BYTES, validateRecipe, parseRecipe, serializeRecipe} from '../activity-studio/recipe.mjs';
import {examples, getExample} from '../activity-studio/examples.mjs';
import {mountPlayer} from '../activity-studio/player.mjs';

const fresh = () => getExample('first-crossing');
const change = modify => { const recipe = fresh(); modify(recipe); return recipe; };

test('invalid preview start positions fail before inspecting or replacing a player root', () => {
  const root = {get ownerDocument() { throw new Error('The existing player must not be touched.'); }};
  for (const startStep of [-1, 2, 100, 0.5, NaN, Infinity, '1', null, true]) {
    assert.throws(() => mountPlayer(root, fresh(), {startStep}), {name:'RangeError'});
  }
});

test('curated examples have exact keys, finite pieces, and the specified constructions', () => {
  assert.deepEqual(examples.map(entry => entry.key), ['first-crossing', 'another-way']);
  assert.deepEqual(fresh().steps.map(step => step.pieces), [[4, 4], [2, 2, 2, 2]]);
  assert.deepEqual(getExample('another-way').steps.map(step => step.pieces), [[4, 2, 2, 2, 2], [4, 4, 2, 2, 1, 1]]);
  for (const {recipe} of examples) {
    assert.deepEqual(Object.keys(recipe), ['schemaVersion', 'template', 'templateVersion', 'id', 'title', 'author', 'license', 'attribution', 'summary', 'goal', 'prerequisites', 'steps']);
    assert.equal(recipe.license, 'CC-BY-4.0');
    assert.match(recipe.attribution, /Fraction Bridge by Open Education contributors/);
    assert.match(recipe.attribution, /https:\/\/github.com\/Jstn-1g\/open-education-proposal/);
    for (const step of recipe.steps) {
      const solutions = [];
      for (let mask = 0; mask < 2 ** step.pieces.length; mask++) {
        const chosen = step.pieces.filter((_, index) => mask & 2 ** index);
        if (chosen.reduce((sum, value) => sum + value, 0) === 8) solutions.push(chosen);
      }
      assert.ok(solutions.length > 0, 'A subset of the finite physical pieces fills exactly eight units');
      if (recipe.id === 'another-way') {
        assert.ok(solutions.every(solution => solution.length < step.pieces.length));
        assert.ok(new Set(solutions.map(solution => [...solution].sort().join(','))).size > 1, 'Choices permit distinct combinations, not only different piece IDs');
      }
    }
  }
});

test('validation returns independent plain data without changing the caller or curated examples', () => {
  const source = fresh();
  const copy = validateRecipe(source);
  copy.title = 'A local edit'; copy.steps[0].pieces[0] = 1;
  assert.equal(source.title, 'Build a first crossing');
  assert.deepEqual(source.steps[0].pieces, [4, 4]);
  source.steps[0].prompt = 'Changed';
  assert.notEqual(fresh().steps[0].prompt, 'Changed');
  assert.ok(Object.isFrozen(examples[0].recipe.steps[0].pieces));
  assert.throws(() => getExample('unknown'), /known example/);
});

test('canonical output ignores input key order, normalizes whitespace, and round-trips UTF-8', () => {
  const source = change(recipe => {
    recipe.title = '  Un pont 🦊  ';
    recipe.author = 'معلّم';
    recipe.summary = 'Une moitié.\r\nDeux quarts.';
    recipe.prerequisites = '';
    recipe.steps[0].hint = 'Même quantité.\n可以用另一种方式。';
  });
  const reversed = Object.fromEntries(Object.entries(source).reverse());
  const output = serializeRecipe(source);
  assert.equal(output, serializeRecipe(reversed));
  assert.ok(output.endsWith('\n'));
  const parsed = parseRecipe(new TextDecoder().decode(new TextEncoder().encode(output)));
  assert.equal(parsed.title, 'Un pont 🦊');
  assert.equal(parsed.summary, 'Une moitié.\nDeux quarts.');
  assert.equal(parsed.author, source.author);
  assert.deepEqual(parsed, validateRecipe(source));
  assert.equal(serializeRecipe(parsed), output);
});

test('plain text remains literal data, not markup or executable code', () => {
  const source = change(recipe => { recipe.title = '<b>Build</b>'; recipe.steps[0].hint = '<script>doNothing()</script>'; });
  assert.equal(parseRecipe(serializeRecipe(source)).steps[0].hint, '<script>doNothing()</script>');
});

test('malformed JSON and non-record inputs fail with readable errors', () => {
  for (const input of ['', '{', '{"steps":[]', 'undefined', '{} trailing', '\uFEFF{}']) assert.throws(() => parseRecipe(input), /valid JSON/);
  for (const input of [null, [], 1, true, 'recipe', new Date()]) assert.throws(() => validateRecipe(input), /plain JSON object/);
  assert.throws(() => parseRecipe({}), /containing text/);
  assert.throws(() => parseRecipe('{}'), /exactly these fields/);
});

test('JSON with repeated or escape-equivalent fields is refused instead of silently keeping the last value', () => {
  const source = serializeRecipe(fresh());
  assert.throws(() => parseRecipe(source.replace('"schemaVersion": 1,', '"schemaVersion": 2, "schemaVersion": 1,')), /repeats a field/);
  assert.throws(() => parseRecipe(source.replace('"id": "two-halves",', '"id": "other", "\\u0069d": "two-halves",')), /repeats a field/);
  const punctuation = change(recipe => { recipe.summary = 'Quotes " and brackets {}, [] and \\ stay plain text.'; });
  assert.deepEqual(parseRecipe(serializeRecipe(punctuation)), punctuation);
  assert.throws(() => parseRecipe('['.repeat(1000) + '0' + ']'.repeat(1000)), /plain JSON object/);
});

test('unknown, missing, review, prototype, and code-bearing fields are rejected at every record level', () => {
  for (const field of ['reviewStatus', 'approved', 'script', 'url', '__proto__', 'prototype', 'constructor']) {
    const source = fresh();
    Object.defineProperty(source, field, {value: 'not allowed', enumerable: true});
    assert.throws(() => validateRecipe(source), /exactly these fields/);
    const stepSource = fresh();
    Object.defineProperty(stepSource.steps[0], field, {value: {}, enumerable: true});
    assert.throws(() => validateRecipe(stepSource), /exactly these fields/);
  }
  const poisonedJson = serializeRecipe(fresh()).replace('"schemaVersion": 1,', '"schemaVersion": 1, "__proto__": {"polluted": true},');
  assert.throws(() => parseRecipe(poisonedJson), /exactly these fields/);
  assert.equal({}.polluted, undefined);
  assert.throws(() => validateRecipe(change(recipe => { delete recipe.goal; })), /exactly these fields/);
  assert.throws(() => validateRecipe(change(recipe => { delete recipe.attribution; })), /exactly these fields/);
  assert.throws(() => validateRecipe(change(recipe => { delete recipe.steps[0].hint; })), /exactly these fields/);
  assert.throws(() => validateRecipe({...fresh(), [Symbol('extra')]: 1}), /exactly these fields/);
});

test('validation rejects accessors, hidden values, custom prototypes and sparse or extended arrays without calling getters', () => {
  let accessed = false;
  const source = fresh();
  Object.defineProperty(source, 'title', {get() { accessed = true; throw new Error('Must not run'); }, enumerable: true});
  assert.throws(() => validateRecipe(source), /ordinary JSON values/);
  assert.equal(accessed, false);
  assert.throws(() => validateRecipe(Object.assign(Object.create({extra: true}), fresh())), /plain JSON object/);
  assert.deepEqual(validateRecipe(Object.assign(Object.create(null), fresh())), fresh());
  assert.throws(() => validateRecipe(change(recipe => Object.defineProperty(recipe, 'title', {enumerable: false}))), /ordinary JSON values/);
  assert.throws(() => validateRecipe(change(recipe => { delete recipe.steps[0]; })), /complete JSON array/);
  assert.throws(() => validateRecipe(change(recipe => { recipe.steps.extra = 1; })), /complete JSON array/);
  assert.throws(() => validateRecipe(change(recipe => {
    Object.defineProperty(recipe.steps[0].pieces, '0', {get() { accessed = true; return 4; }});
  })), /without accessors/);
  assert.equal(accessed, false);
});

test('version, template and license values are fixed and never coerced', () => {
  for (const [field, values] of Object.entries({schemaVersion: [0, 2, '1', null], templateVersion: [2, '1'], template: ['pendulum', null], license: ['MIT', '', null]})) {
    for (const value of values) assert.throws(() => validateRecipe(change(recipe => { recipe[field] = value; })));
  }
});

test('text bounds count Unicode characters, permit optional empty fields, and reject unsupported controls', () => {
  const limits = {title: 80, author: 80, attribution: 600, summary: 240, goal: 240, prerequisites: 240};
  for (const [field, max] of Object.entries(limits)) {
    assert.equal([...validateRecipe(change(recipe => { recipe[field] = '🦊'.repeat(max); }))[field]].length, max);
    assert.throws(() => validateRecipe(change(recipe => { recipe[field] = 'x'.repeat(max + 1); })), /characters/);
    if (field !== 'prerequisites') assert.throws(() => validateRecipe(change(recipe => { recipe[field] = '  '; })), /characters/);
  }
  for (const [field, max] of [['prompt', 180], ['hint', 240]]) {
    assert.doesNotThrow(() => validateRecipe(change(recipe => { recipe.steps[0][field] = 'x'.repeat(max); })));
    assert.throws(() => validateRecipe(change(recipe => { recipe.steps[0][field] = 'x'.repeat(max + 1); })), /characters/);
  }
  for (const value of ['a\tb', 'a\u0000b', 'a\u007Fb', 'a\u0085b', 'a\u202Eb', 'a\u2066b', 'a\rb']) {
    assert.throws(() => validateRecipe(change(recipe => { recipe.summary = value; })), /control characters/);
  }
  for (const value of ['a\nb', 'a\r\nb', 'a\u2028b']) assert.throws(() => validateRecipe(change(recipe => { recipe.title = value; })), /line breaks/);
  for (const value of ['a\uD800b', 'a\uDC00b']) assert.throws(() => validateRecipe(change(recipe => { recipe.goal = value; })), /Unicode/);
  assert.throws(() => validateRecipe(change(recipe => { recipe.title = 123; })), /must be text/);
});

test('IDs are bounded slugs and each step ID is unique after normalization', () => {
  for (const id of ['', 'Upper', 'two words', '../path', 'a--b', '-a', 'a-', 'x'.repeat(65)]) {
    assert.throws(() => validateRecipe(change(recipe => { recipe.id = id; })));
  }
  assert.doesNotThrow(() => validateRecipe(change(recipe => { recipe.id = 'x'.repeat(64); })));
  assert.throws(() => validateRecipe(change(recipe => { recipe.steps[1].id = ' ' + recipe.steps[0].id + ' '; })), /different ID/);
});

test('step and finite piece bounds include endpoints and reject impossible or unsupported constructions', () => {
  assert.doesNotThrow(() => validateRecipe(change(recipe => { recipe.steps.length = 1; })));
  assert.doesNotThrow(() => validateRecipe(change(recipe => { recipe.steps = Array.from({length: 5}, (_, i) => ({...recipe.steps[0], id: 'step-' + i})); })));
  for (const count of [0, 6]) assert.throws(() => validateRecipe(change(recipe => { recipe.steps = Array.from({length: count}, (_, i) => ({...recipe.steps[0], id: 'step-' + i})); })), /1–5/);
  assert.doesNotThrow(() => validateRecipe(change(recipe => { recipe.steps[0].pieces = Array(12).fill(1); })));
  for (const pieces of [[], [4], Array(13).fill(1)]) assert.throws(() => validateRecipe(change(recipe => { recipe.steps[0].pieces = pieces; })), /2–12/);
  for (const pieces of [[4, 2], [2, 2, 2], [1, 1, 1, 1, 1, 1, 1]]) assert.throws(() => validateRecipe(change(recipe => { recipe.steps[0].pieces = pieces; })), /one whole bridge/);
  for (const value of [8, 3, 0, -1, 1.5, NaN, Infinity, '4', true, null]) assert.throws(() => validateRecipe(change(recipe => { recipe.steps[0].pieces = [4, 4, value]; })), /whole-number units/);
});

test('feasibility agrees with independent subset enumeration for every tray of two through six pieces', () => {
  let checked = 0;
  function visit(pieces) {
    if (pieces.length >= 2) {
      const possible = Array.from({length: 2 ** pieces.length}, (_, mask) =>
        pieces.reduce((sum, value, index) => sum + (mask & 2 ** index ? value : 0), 0)).includes(8);
      const candidate = change(recipe => { recipe.steps = [{...recipe.steps[0], pieces}]; });
      if (possible) assert.doesNotThrow(() => validateRecipe(candidate));
      else assert.throws(() => validateRecipe(candidate), /one whole bridge/);
      checked++;
    }
    if (pieces.length < 6) for (const value of [1, 2, 4]) visit([...pieces, value]);
  }
  visit([]);
  assert.equal(checked, 1089);
});

test('UTF-8 input budget is enforced before parsing and on direct object validation', () => {
  assert.equal(MAX_RECIPE_BYTES, 32768);
  const valid = serializeRecipe(fresh());
  const exact = valid + ' '.repeat(MAX_RECIPE_BYTES - new TextEncoder().encode(valid).byteLength);
  assert.deepEqual(parseRecipe(exact), fresh());
  assert.throws(() => parseRecipe(exact + ' '), /32 KiB/);
  assert.throws(() => parseRecipe('🦊'.repeat(9000)), /32 KiB/);
  assert.throws(() => validateRecipe(change(recipe => { recipe.summary = ' '.repeat(MAX_RECIPE_BYTES) + 'x'; })), /32 KiB/);
  assert.throws(() => validateRecipe(change(recipe => { recipe.title = ' '.repeat(20000) + 'x'; recipe.author = ' '.repeat(20000) + 'y'; })), /32 KiB/);
});
