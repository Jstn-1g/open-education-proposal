import { getExample } from './examples.mjs';
import { validateRecipe, parseRecipe, serializeRecipe, MAX_RECIPE_BYTES } from './recipe.mjs';
import { mountPlayer } from './player.mjs';

const $ = selector => document.querySelector(selector);
const fields = {title:'#activity-title',author:'#activity-author',summary:'#activity-summary',goal:'#activity-goal',prerequisites:'#activity-prerequisites'};
let draft = null, currentStep = 0, player = null, dirty = false, sourceAuthor = '', sourceTitle = '', sourceAttribution = '', fileRevision = 0, creditEdited = false;
let editRevision = 0, downloadRevision = null, invalidField = null;
const changedTrays = new Set();
const query = new URLSearchParams(location.search);
const forcedColors = matchMedia('(forced-colors: active)');
$('#studio-simple').checked = query.get('view') === 'simple' || forcedColors.matches || Boolean(navigator.connection?.saveData);

function status(message, error = false) {
  const box = $('#studio-status'); box.hidden = !message; box.textContent = message; box.classList.toggle('is-error', error);
}
function setDirty(value) {
  dirty = value;
  $('#draft-status').textContent = dirty ? 'Unsaved changes · Download to keep your work.' : 'Draft in memory · No automatic saving.';
}
function clearFieldError() {
  if (invalidField) {
    invalidField.removeAttribute('aria-invalid');
    const ids = (invalidField.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== 'field-error');
    if (ids.length) invalidField.setAttribute('aria-describedby', ids.join(' '));
    else invalidField.removeAttribute('aria-describedby');
  }
  invalidField = null; $('#field-error')?.remove();
}
function reveal(element) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
}
function validationError(error) {
  clearFieldError(); status(error.message, true);
  let target = error.field || null;
  const stepError = /^Step (\d+) (prompt|hint|pieces|needs)/.exec(error.message);
  if (stepError) {
    currentStep = Number(stepError[1]) - 1; renderStep();
    target = stepError[2] === 'prompt' ? '#step-prompt' : stepError[2] === 'hint' ? '#step-hint' : '#piece-halves';
  }
  if (!target) {
    const key = Object.keys(fields).find(key => error.message.startsWith(key[0].toUpperCase() + key.slice(1) + ' '));
    target = key ? fields[key] : /credit trail|^Attribution /.test(error.message) ? '#activity-credit' : null;
  }
  if (!target) return;
  invalidField = $(target); if (!invalidField) return;
  reveal(invalidField);
  const note = document.createElement('p'); note.id = 'field-error'; note.className = 'field-error';
  note.textContent = error.field ? 'Use a whole number from 0 to 12.'
    : /credit trail/.test(error.message) ? 'Keep the credit within 600 characters. Preserve the original authors and source links.'
    : /^Step \d+ needs/.test(error.message) ? 'These pieces cannot make one whole bridge. Change the pieces in this tray.'
    : error.message;
  // Count errors span the entire tray editor, not one narrow number-input column.
  (invalidField.closest('.piece-counts') || invalidField).after(note);
  invalidField.setAttribute('aria-invalid', 'true');
  invalidField.setAttribute('aria-describedby', [invalidField.getAttribute('aria-describedby'), note.id].filter(Boolean).join(' '));
  invalidField.focus();
  const countLabel = invalidField.closest('.piece-counts label');
  // Keep the count label at the top so its full-width message can also enter view.
  (countLabel || invalidField).scrollIntoView({block:countLabel ? 'start' : 'center'});
}
function changed(event) {
  ++editRevision; downloadRevision = null; $('#confirm-saved').hidden = true;
  if (draft && event?.target.closest('.piece-counts')) {
    changedTrays.add(draft.steps[currentStep].id);
    $('#tray-review-note').hidden = false;
  }
  if (!event || event.target === invalidField) { clearFieldError(); status(''); }
  setDirty(true); $('#preview-status').textContent = 'Edits waiting · Preview this challenge to try your changes.';
}
function readStep() {
  if (!draft) return;
  const step = draft.steps[currentStep];
  const inputs = [$('#piece-halves'),$('#piece-quarters'),$('#piece-eighths')];
  const counts = inputs.map(input => Number(input.value));
  // Keep invalid raw values visible instead of replacing them when switching steps.
  if (counts.some((count,i) => !Number.isInteger(count) || count < 0 || count > 12 || !inputs[i].value.trim())) {
    const index = counts.findIndex((count,i) => !Number.isInteger(count) || count < 0 || count > 12 || !inputs[i].value.trim());
    throw Object.assign(new Error('Use a whole-number count from 0 to 12 for each piece size before switching or previewing. Your entered values are still here.'), {field:'#' + inputs[index].id});
  }
  step.prompt = $('#step-prompt').value; step.hint = $('#step-hint').value;
  if (counts.some((count,i) => count !== step.pieces.filter(unit => unit === [4,2,1][i]).length)) {
    step.pieces = counts.flatMap((count,i) => Array(count).fill([4,2,1][i]));
  }
}
function readDraft() {
  if (!draft) throw new Error('Choose an example or open an activity file first.');
  for (const [key,selector] of Object.entries(fields)) draft[key] = $(selector).value;
  readStep();
  const changedAuthor = draft.author.trim() !== sourceAuthor;
  const credit = creditEdited ? $('#activity-credit').value : changedAuthor ? `Adapted from “${sourceTitle}” by ${sourceAuthor}.\n${sourceAttribution}` : sourceAttribution;
  if ([...credit.trim()].length > 600) throw new Error('The credit trail exceeds 600 characters. Under Learning goal & credits, open “Consolidate a long credit trail” and shorten it while keeping the authors and source links. The original credit is preserved above it.');
  draft.attribution = credit;
  return validateRecipe(draft);
}
function renderSteps() {
  $('#step-list').replaceChildren(...draft.steps.map((step,index) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = String(index + 1);
    button.dataset.stepIndex = index; button.setAttribute('aria-label', 'Edit challenge ' + (index + 1)); button.setAttribute('aria-pressed', String(index === currentStep));
    button.addEventListener('click', () => {
      try { readStep(); clearFieldError(); currentStep = index; renderStep(); $('#step-list [aria-pressed="true"]').focus({preventScroll:true}); }
      catch (error) { validationError(error); }
    }); return button;
  }));
  $('#step-count').textContent = draft.steps.length + ' of 5 available';
  $('#editing-step').textContent = 'Editing challenge ' + (currentStep + 1);
  $('#edit-current-step').textContent = 'Back to editing challenge ' + (currentStep + 1);
  $('#add-step').disabled = draft.steps.length >= 5; $('#remove-step').disabled = draft.steps.length <= 1;
}
function renderStep() {
  const step = draft.steps[currentStep]; $('#step-prompt').value = step.prompt; $('#step-hint').value = step.hint;
  $('#tray-review-note').hidden = !changedTrays.has(step.id);
  for (const [unit,id] of [[4,'#piece-halves'],[2,'#piece-quarters'],[1,'#piece-eighths']]) $(id).value = step.pieces.filter(value => value === unit).length;
  renderSteps();
}
function preview(recipe, startStep = 0, moveFocus = false) {
  const nextRoot = document.createElement('div');
  const nextPlayer = mountPlayer(nextRoot, recipe, {simple:$('#studio-simple').checked, startStep});
  player?.destroy(); player = nextPlayer; $('#studio-preview').replaceChildren(nextRoot);
  $('#recipe-json').value = serializeRecipe(recipe);
  $('#preview-status').textContent = 'Preview up to date · Starting with challenge ' + (startStep + 1) + ' of ' + recipe.steps.length + '.';
  if (moveFocus) {
    const heading = $('#studio-preview .player-heading'); heading.tabIndex = -1; heading.focus();
  }
}
function loadRecipe(recipe, imported = false) {
  draft = validateRecipe(recipe); currentStep = 0; sourceAuthor = draft.author; sourceTitle = draft.title; sourceAttribution = draft.attribution;
  changedTrays.clear();
  for (const [key,selector] of Object.entries(fields)) $(selector).value = draft[key];
  $('#activity-attribution').textContent = draft.attribution;
  $('#activity-credit').value = draft.attribution; creditEdited = false;
  ++editRevision; downloadRevision = null; $('#confirm-saved').hidden = true; clearFieldError();
  renderStep(); preview(draft); setDirty(false);
  $('#studio-form').disabled = false; $('#download-recipe').disabled = false; $('#copy-recipe').disabled = false; $('#edit-current-step').disabled = false;
  status(imported ? 'Activity file opened locally. This is an unreviewed draft; nothing was uploaded.' : '');
}
function confirmReplace() { return !dirty || window.confirm('Replace your unsaved draft? Keep it here unless you have confirmed that your file was saved.'); }
for (const selector of [...Object.values(fields),'#step-prompt','#step-hint','#piece-halves','#piece-quarters','#piece-eighths']) {
  $(selector).addEventListener('input', changed);
}
$('#add-step').addEventListener('click', () => {
  try { readStep(); } catch (error) { validationError(error); return; }
  if (draft.steps.length >= 5) return;
  let next = 1; while (draft.steps.some(step => step.id === 'challenge-' + next)) ++next;
  draft.steps.push({id:'challenge-' + next,prompt:'Build a whole bridge another way.',pieces:[4,2,2,2,2],hint:'Two quarters fill the same space as one half.'});
  currentStep = draft.steps.length - 1; renderStep(); changed(); $('#step-prompt').focus();
});
$('#activity-credit').addEventListener('input', event => { creditEdited = true; changed(event); });
$('#remove-step').addEventListener('click', () => {
  if (!draft || draft.steps.length <= 1) return;
  if (!window.confirm('Remove challenge ' + (currentStep + 1) + ' from this draft?')) return;
  changedTrays.delete(draft.steps[currentStep].id);
  draft.steps.splice(currentStep,1); currentStep = Math.min(currentStep,draft.steps.length - 1); renderStep(); changed(); $('#step-prompt').focus();
});
$('#preview-update').addEventListener('click', () => {
  try { preview(readDraft(), currentStep, true); clearFieldError(); status('Preview updated. Try each challenge before sharing.'); }
  catch (error) { validationError(error); }
});
$('#preview-all').addEventListener('click', () => {
  try { preview(readDraft(), 0, true); clearFieldError(); status('Full activity ready. Try every challenge before sharing.'); }
  catch (error) { validationError(error); }
});
$('#edit-current-step').addEventListener('click', () => $('#step-prompt').focus());
$('#studio-simple').addEventListener('change', () => player?.setSimple($('#studio-simple').checked));
forcedColors.addEventListener('change', () => {
  if (forcedColors.matches) {
    $('#studio-simple').checked = true;
    player?.setSimple(true);
  }
});
$('#review-step-hint').addEventListener('click', () => {
  reveal($('#step-hint')); $('#step-hint').focus();
});
$('#new-draft').addEventListener('click', () => {
  if (!confirmReplace()) return;
  ++fileRevision;
  try { loadRecipe(getExample($('#start-template').value)); }
  catch (error) { status(error.message, true); }
});
$('#import-recipe').addEventListener('change', async event => {
  const file = event.target.files?.[0], revision = ++fileRevision; event.target.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_RECIPE_BYTES) throw new Error('This file is too large. Activity recipes must be 32 KB or smaller.');
    const recipe = parseRecipe(await file.text());
    if (revision !== fileRevision || !confirmReplace()) return;
    loadRecipe(recipe, true);
  } catch (error) { if (revision === fileRevision) status('Could not open this file. ' + error.message + ' Your current draft is unchanged.', true); }
});
$('#download-recipe').addEventListener('click', () => {
  try {
    const recipe = readDraft(), json = serializeRecipe(recipe), blob = new Blob([json], {type:'application/json'});
    // A portable suggested name, not an identity change or an arbitrary file path.
    const titleSlug = recipe.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').slice(0, 64).replace(/^-+|-+$/g, '');
    const href = URL.createObjectURL(blob), link = document.createElement('a'); link.href = href;
    link.download = 'activity-' + (titleSlug || recipe.id) + '.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    $('#recipe-json').value = json; clearFieldError(); downloadRevision = editRevision; $('#confirm-saved').hidden = !dirty;
    $('#draft-status').textContent = 'Download requested · Check your downloads to confirm it was saved.';
    status('Activity file prepared. It contains your current edits. Nothing was published.');
  } catch (error) { validationError(error); }
});
$('#confirm-saved').addEventListener('click', () => {
  if (downloadRevision !== editRevision) return;
  setDirty(false); $('#confirm-saved').hidden = true;
  $('#draft-status').textContent = 'You confirmed a saved copy of this version.';
  status('Saved copy confirmed. Further edits will need a new download.');
});
$('#copy-recipe').addEventListener('click', async () => {
  let json;
  try { json = serializeRecipe(readDraft()); }
  catch (error) { validationError(error); return; }
  clearFieldError(); $('#recipe-json').value = json;
  const copyRevision = editRevision;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Select the recipe text below and copy it, or download the activity file.');
    await navigator.clipboard.writeText(json);
    if (copyRevision === editRevision) status('Recipe copied. Paste it into your activity proposal; nothing was submitted.');
  } catch {
    if (copyRevision !== editRevision) return;
    status('Automatic copying is unavailable. Your current validated recipe is selected below; copy it manually or download the file. Nothing was submitted.', true);
    $('#share-draft').open = true; $('#recipe-json').focus(); $('#recipe-json').select();
  }
});
function openShareSection() { if (location.hash === '#share-draft') $('#share-draft').open = true; }
openShareSection(); window.addEventListener('hashchange', openShareSection);
for (const link of document.querySelectorAll('a[href="#share-draft"]')) {
  link.addEventListener('click', () => { $('#share-draft').open = true; });
}
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
for (const selector of ['#import-recipe','#start-template','#new-draft','#studio-simple']) $(selector).disabled = false;
try { loadRecipe(getExample(query.get('example') ?? 'first-crossing')); }
catch (error) { status('This starting activity is unavailable. Choose an example above or open a valid file. ' + error.message, true); }
