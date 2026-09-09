import test from 'node:test';
import assert from 'node:assert/strict';
import { repartition, fractionFeedback, period, compareSetup } from '../learning-lab/model.mjs';

test('repartitioning keeps the same amount; unequal cuts are refused', () => {
  assert.equal(repartition(1, 2, 4), 2);
  assert.equal(repartition(2, 4, 8), 4);
  assert.equal(repartition(4, 8, 2), 1);
  assert.equal(repartition(3, 4, 2), null);
  assert.equal(repartition(0, 4, 2), 0);
  assert.equal(repartition(8, 8, 2), 2);
});
test('fraction feedback reports quantities, not a learner score', () => {
  assert.match(fractionFeedback(2, 4, 1, 2), /same amount/);
  assert.match(fractionFeedback(1, 4, 1, 2), /less/i);
  assert.match(fractionFeedback(3, 4, 1, 2), /more/i);
});
test('feedback does not trap a quarter target in an impossible halves-only loop', () => {
  assert.match(fractionFeedback(1, 2, 3, 4), /4 pieces/);
  assert.match(fractionFeedback(2, 2, 1, 4), /4 pieces/);
});
test('known ideal pendulum periods and square-root length relationship', () => {
  assert.ok(Math.abs(period(1) - 2.0060666807106475) < 1e-12);
  assert.ok(Math.abs(period(0.5) - 1.4185033534428875) < 1e-12);
  assert.ok(Math.abs(period(1.5) - 2.456919878869913) < 1e-12);
  assert.ok(Math.abs(period(1.5) / period(0.5) - Math.sqrt(3)) < 1e-12);
});
test('setup comparison separates mass, length, neither, and both changes', () => {
  assert.deepEqual(compareSetup(1, 200), { changed: 'mass', outcome: 'same' });
  assert.deepEqual(compareSetup(0.5, 100), { changed: 'length', outcome: 'faster' });
  assert.deepEqual(compareSetup(1.5, 400), { changed: 'both', outcome: 'slower' });
  assert.deepEqual(compareSetup(1, 100), { changed: 'neither', outcome: 'same' });
});
test('invalid quantities and model inputs are rejected', () => {
  for (const args of [[-1,2,4],[3,2,4],[1,3,4],[0.5,2,4]])
    assert.throws(() => repartition(...args));
  for (const length of [0, -1, NaN, Infinity, '1']) assert.throws(() => period(length));
  assert.throws(() => compareSetup(0.7, 100));
  assert.throws(() => compareSetup(1, 999));
});
