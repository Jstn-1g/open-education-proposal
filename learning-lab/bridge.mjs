// Integer eighths keep every construction exact. The full span is always 8.
export const TOTAL = 8;
export function amount(blocks) {
  if (!Array.isArray(blocks) || blocks.some(n => ![1, 2, 4].includes(n))) throw new RangeError('Use halves, quarters, or eighths.');
  const sum = blocks.reduce((a, b) => a + b, 0);
  if (sum > TOTAL) throw new RangeError('The bridge cannot exceed one whole.');
  return sum;
}
export function add(blocks, units) {
  amount(blocks);
  if (![1, 2, 4].includes(units)) throw new RangeError('Unknown piece.');
  return amount(blocks) + units <= TOTAL ? [...blocks, units] : null;
}
export function split(blocks, index) {
  amount(blocks);
  if (!Number.isInteger(index) || index < 0 || index >= blocks.length || blocks[index] === 1) return null;
  return [...blocks.slice(0, index), blocks[index] / 2, blocks[index] / 2, ...blocks.slice(index + 1)];
}
export function name(units) { return ({1: '1/8', 2: '1/4', 4: '1/2', 6: '3/4', 8: '1 whole', 0: '0'})[units] ?? `${units}/8`; }
export function compare(blocks, target) {
  if (![2, 4, 6, 8].includes(target)) throw new RangeError('Unknown destination.');
  const n = amount(blocks);
  return n === target ? 'The ends match! Can you reach the same place with different pieces?' : n < target ? 'Not there yet. Add a piece to reach the flag.' : 'Past the flag. Remove or replace a piece, then compare.';
}
