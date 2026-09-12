import {MAX_RECIPE_BYTES, parseRecipe} from './recipe.mjs';
import {getExample} from './examples.mjs';
import {mountPlayer} from './player.mjs';

const $ = selector => document.querySelector(selector);
const fileInput = $('#play-file');
const simpleInput = $('#play-simple');
const status = $('#play-status');
const mount = $('#play-mount');
const metadata = $('#play-metadata');
const metadataDisclosure = $('#play-about');
const query = new URLSearchParams(location.search);
const forcedColors = matchMedia('(forced-colors: active)');
let player = null, importRevision = 0;
simpleInput.checked = query.get('view') === 'simple' || forcedColors.matches || Boolean(navigator.connection?.saveData);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function showError(error) {
  status.classList.add('is-error');
  status.textContent = 'Could not open this activity. ' + (error instanceof Error ? error.message : 'Check the file and try again.') +
    (player ? ' Your current activity is unchanged.' : ' Choose an example from the library or open a valid activity file.');
}
function showRecipe(recipe, exampleKey = null) {
  // Prepare the next player before replacing the last valid one.
  const nextRoot = document.createElement('div');
  const nextPlayer = mountPlayer(nextRoot, recipe, {simple: simpleInput.checked});
  const details = document.createDocumentFragment();
  details.append(element('p', exampleKey ? 'Library example · Unreviewed draft' : 'Imported file · Unreviewed draft', 'eyebrow'));
  details.append(element('h2', 'About this activity'));
  details.append(element('p', recipe.summary));
  details.append(element('p', 'Purpose: ' + recipe.goal));
  details.append(element('p', 'Before trying it: ' + (recipe.prerequisites || 'No prerequisites supplied by the author.')));
  details.append(element('p', 'Author: ' + recipe.author + ' · Content license: CC BY 4.0', 'muted'));
  details.append(element('p', 'Attribution: ' + recipe.attribution, 'muted'));
  details.append(element('p', 'Fraction Bridge template 1 · ' + recipe.steps.length + (recipe.steps.length === 1 ? ' step' : ' steps') + ' · No scores or saved progress.', 'muted'));
  player?.destroy();
  player = nextPlayer;
  mount.replaceChildren(nextRoot);
  metadata.replaceChildren(details);
  metadata.hidden = false;
  metadataDisclosure.hidden = false;
  $('#play-title').textContent = recipe.title;
  document.title = recipe.title + ' · Activity Studio';
  const remix = $('#play-remix');
  remix.href = exampleKey ? 'edit.html?example=' + encodeURIComponent(exampleKey) : 'edit.html';
  remix.textContent = exampleKey ? 'Remix in the studio' : 'Open the studio to remix this file';
  $('#play-remix-note').hidden = Boolean(exampleKey);
  status.classList.remove('is-error');
  status.textContent = exampleKey ? 'Example ready. Your activity starts fresh.' : 'Local draft ready. Nothing was uploaded or published.';
}

function openLinkedSection() {
  if (location.hash === '#import') $('#import').open = true;
}
openLinkedSection();
window.addEventListener('hashchange', openLinkedSection);

simpleInput.addEventListener('change', () => player?.setSimple(simpleInput.checked));
forcedColors.addEventListener('change', () => {
  if (forcedColors.matches) {
    simpleInput.checked = true;
    player?.setSimple(true);
  }
});
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const revision = ++importRevision;
  try {
    if (file.size > MAX_RECIPE_BYTES) throw new Error('The file must be 32 KiB or smaller.');
    const text = await file.text();
    if (revision !== importRevision) return;
    const recipe = parseRecipe(text);
    showRecipe(recipe);
    const title = $('#play-title');
    title.tabIndex = -1;
    title.focus();
  } catch (error) {
    if (revision === importRevision) showError(error);
  } finally {
    if (revision === importRevision) fileInput.value = '';
  }
});

try {
  const key = query.has('example') ? query.get('example') : 'first-crossing';
  showRecipe(getExample(key), key);
} catch (error) {
  showError(error);
}
fileInput.disabled = false;
simpleInput.disabled = false;
