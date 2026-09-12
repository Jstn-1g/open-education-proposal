import {validateRecipe} from './recipe.mjs';

function example(key, title, summary, goal, steps) {
  const recipe = validateRecipe({
    schemaVersion: 1, template: 'fraction-bridge', templateVersion: 1,
    id: key, title, author: 'Open Education proposal', license: 'CC-BY-4.0',
    attribution: 'Fraction Bridge by Open Education contributors. Source: https://github.com/Jstn-1g/open-education-proposal · CC BY 4.0.',
    summary, goal,
    prerequisites: 'Familiarity with equal shares. A half, quarter, and eighth refer to the same whole bridge.',
    steps,
  });
  for (const step of recipe.steps) { Object.freeze(step.pieces); Object.freeze(step); }
  Object.freeze(recipe.steps);
  return Object.freeze({key, recipe: Object.freeze(recipe)});
}

// Curation and review labels are application metadata, not claims inside these files.
export const examples = Object.freeze([
  example('first-crossing', 'Build a first crossing',
    'Build one whole bridge with two halves, then rebuild the same span with four quarters.',
    'Explore how two halves and four quarters can each fill the same whole bridge.', [
      {id: 'two-halves', prompt: 'Help the fox cross. Place the two equal pieces.', pieces: [4, 4], hint: 'Each piece fills one half of this bridge.'},
      {id: 'four-quarters', prompt: 'Build the same whole bridge with smaller pieces.', pieces: [2, 2, 2, 2], hint: 'Each piece fills one quarter. The whole bridge has not changed size.'},
    ]),
  example('another-way', 'Find another way across',
    'Choose from different-sized pieces. Build one whole bridge; some pieces can stay in the tray.',
    'Explore different combinations of halves, quarters, and eighths that fill the same whole bridge.', [
      {id: 'halves-and-quarters', prompt: 'Build the whole bridge. You do not need every piece.', pieces: [4, 2, 2, 2, 2], hint: 'One half fills the same span as two quarters. Try either size.'},
      {id: 'choose-a-combination', prompt: 'Choose pieces to make one whole. Can you find another combination?', pieces: [4, 4, 2, 2, 1, 1], hint: 'Two eighths fill the same span as one quarter. Unused pieces can stay in the tray.'},
    ]),
]);

export function getExample(key) {
  const entry = examples.find(item => item.key === key);
  if (!entry) throw new Error('Choose a known example: first-crossing or another-way.');
  return validateRecipe(entry.recipe);
}
