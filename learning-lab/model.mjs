// Original, deterministic models. No learner data or network operations.
const divisions = [2, 4, 8];
function fraction(count, parts) {
  if (!divisions.includes(parts) || !Number.isInteger(count) || count < 0 || count > parts)
    throw new RangeError('Use whole piece counts within a supported partition.');
}
export function repartition(count, from, to) {
  fraction(count, from);
  if (!divisions.includes(to)) throw new RangeError('Unsupported partition.');
  const converted = count * to / from;
  return Number.isInteger(converted) ? converted : null;
}
export function fractionFeedback(count, parts, targetCount, targetParts) {
  fraction(count, parts); fraction(targetCount, targetParts);
  const difference = count * targetParts - targetCount * parts;
  if (!Number.isInteger(targetCount * parts / targetParts))
    return `Try splitting into ${targetParts} pieces first. These pieces cannot make the target exactly.`;
  return difference === 0 ? 'The same amount! Can you split it a different way?'
    : difference < 0 ? 'Less than the target. Try filling another piece.'
    : 'More than the target. Try emptying a piece.';
}
export function period(length) {
  if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0)
    throw new RangeError('Length must be positive and finite.');
  return 2 * Math.PI * Math.sqrt(length / 9.81);
}
export function compareSetup(length, mass) {
  if (![0.5, 1, 1.5].includes(length) || ![100, 200, 400].includes(mass))
    throw new RangeError('Unsupported comparison.');
  return {
    changed: length !== 1 && mass !== 100 ? 'both' : length !== 1 ? 'length' : mass !== 100 ? 'mass' : 'neither',
    outcome: length < 1 ? 'faster' : length > 1 ? 'slower' : 'same',
  };
}
