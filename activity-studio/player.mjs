// Trusted player: recipes supply text and finite pieces, never executable behavior.
const WHOLE = 8;
let instanceCount = 0;
const fraction = units => ({0: '0', 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8', 8: '1 whole'})[units];
const pieceName = units => ({1: 'one eighth', 2: 'one quarter', 4: 'one half'})[units];

export function mountPlayer(root, recipe, {simple = false, onComplete, startStep = 0} = {}) {
  if (!Number.isInteger(startStep) || startStep < 0 || startStep >= recipe.steps.length) {
    throw new RangeError('startStep must be an integer from 0 to ' + (recipe.steps.length - 1) + '.');
  }
  const doc = root.ownerDocument;
  const prefix = 'activity-player-' + ++instanceCount;
  const events = new AbortController();
  let stepIndex = startStep, placed = [], destroyed = false, focusFrame = 0, contextFrame = 0;
  let simpleView = Boolean(simple), artFailed = false;
  const node = (tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (label, testId, className = '') => {
    const element = node('button', className, label);
    element.type = 'button';
    element.dataset.testid = testId;
    return element;
  };
  const fractionLabel = units => {
    const label = node('span', 'player-fraction');
    label.setAttribute('aria-hidden', 'true');
    label.append(node('span', 'player-numerator', '1'), node('span', 'player-denominator', String(WHOLE / units)));
    return label;
  };
  const player = node('section', 'activity-player');
  player.setAttribute('aria-labelledby', prefix + '-heading');
  const progress = node('p', 'player-progress');
  progress.dataset.testid = 'player-progress';
  const heading = node('h2', 'player-heading');
  heading.id = prefix + '-heading';
  const instruction = node('p', 'player-instruction', 'Choose a piece to place in the gap.');
  instruction.id = prefix + '-instruction';
  const stage = node('div', 'player-stage');
  const scenery = node('img', 'player-scenery');
  scenery.alt = '';
  scenery.setAttribute('aria-hidden', 'true');
  const leftBank = node('span', 'player-bank player-bank-left');
  const rightBank = node('span', 'player-bank player-bank-right');
  leftBank.setAttribute('aria-hidden', 'true');
  rightBank.setAttribute('aria-hidden', 'true');
  const fox = node('span', 'player-fox', '🦊');
  fox.setAttribute('aria-hidden', 'true');
  const bridge = node('div', 'player-bridge');
  bridge.dataset.testid = 'player-bridge';
  bridge.setAttribute('role', 'img');
  const spanLabel = node('span', 'player-whole-label', 'The gap = 1 whole');
  spanLabel.setAttribute('aria-hidden', 'true');
  stage.append(scenery, leftBank, rightBank, fox, bridge);
  const graphicsNote = node('p', 'player-graphics-note');
  graphicsNote.hidden = true;
  const trayLabel = node('p', 'player-tray-label', 'Pieces to choose from');
  trayLabel.id = prefix + '-tray-label';
  const tray = node('div', 'player-tray');
  tray.dataset.testid = 'player-tray';
  tray.setAttribute('role', 'group');
  tray.setAttribute('aria-labelledby', trayLabel.id);
  const feedback = node('div', 'player-feedback');
  feedback.id = prefix + '-feedback';
  feedback.dataset.testid = 'player-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.setAttribute('aria-atomic', 'true');
  const feedbackTitle = node('strong');
  const feedbackCopy = node('p');
  feedback.append(feedbackTitle, feedbackCopy);
  const actions = node('div', 'player-actions');
  const next = button('Next step', 'player-next', 'player-primary');
  const replay = button('Replay activity', 'player-replay', 'player-primary');
  next.setAttribute('aria-describedby', feedback.id);
  replay.setAttribute('aria-describedby', feedback.id);
  const undo = button('Undo', 'player-undo');
  const reset = button('Start this step again', 'player-reset');
  actions.append(next, replay, undo, reset);
  const hint = node('details', 'player-hint');
  hint.dataset.testid = 'player-hint';
  const hintSummary = node('summary', '', 'A hint, if you want one');
  const hintCopy = node('p');
  hint.append(hintSummary, hintCopy);
  player.append(progress, heading, instruction, stage, spanLabel, graphicsNote, trayLabel, tray, feedback, actions, hint);
  root.replaceChildren(player);

  const step = () => recipe.steps[stepIndex];
  const total = () => placed.reduce((sum, index) => sum + step().pieces[index], 0);
  const pieceButtons = () => [...tray.querySelectorAll('button')];
  const listen = (element, type, handler) => element.addEventListener(type, handler, {signal: events.signal});
  function say(title, copy) {
    feedbackTitle.textContent = title;
    feedbackCopy.textContent = copy;
  }
  function focusAfterLayout(element) {
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      if (!destroyed && element?.isConnected && !element.disabled && !element.hidden) element.focus();
    });
  }
  function keepBridgeWithFocus() {
    cancelAnimationFrame(contextFrame);
    contextFrame = requestAnimationFrame(() => {
      const control = doc.activeElement, view = doc.defaultView;
      if (destroyed || !view || !control || !player.isConnected ||
          !(tray.contains(control) || actions.contains(control))) return;
      const bridgeBounds = bridge.getBoundingClientRect(), controlBounds = control.getBoundingClientRect();
      // Keep the bridge and focus ring together only when both fit; enlarged content keeps native scrolling.
      const top = Math.min(bridgeBounds.top, controlBounds.top) - 8;
      const bottom = Math.max(bridgeBounds.bottom, controlBounds.bottom) + 8;
      const viewportTop = view.visualViewport?.offsetTop || 0;
      const viewportHeight = view.visualViewport?.height || view.innerHeight;
      if (bottom - top > viewportHeight) return;
      const delta = top < viewportTop ? top - viewportTop
        : bottom > viewportTop + viewportHeight ? bottom - viewportTop - viewportHeight : 0;
      if (delta) view.scrollBy({top: delta, behavior: 'instant'});
    });
  }
  function render() {
    const filled = total(), complete = filled === WHOLE;
    const finalStep = stepIndex === recipe.steps.length - 1;
    player.dataset.stepIndex = stepIndex;
    player.dataset.amount = filled;
    player.classList.toggle('is-complete', complete);
    progress.textContent = 'Step ' + (stepIndex + 1) + ' of ' + recipe.steps.length;
    heading.textContent = step().prompt;
    bridge.replaceChildren(...placed.map(index => {
      const piece = node('span', 'player-placed-piece');
      piece.append(fractionLabel(step().pieces[index]));
      piece.style.gridColumn = 'span ' + step().pieces[index];
      piece.setAttribute('aria-hidden', 'true');
      return piece;
    }));
    bridge.setAttribute('aria-label', complete
      ? 'One whole bridge, made from ' + placed.length + ' pieces. The fox can cross.'
      : 'Bridge filled to ' + fraction(filled) + '. ' + fraction(WHOLE - filled) + ' remains. The fox waits on the left.');
    pieceButtons().forEach((control, index) => {
      const used = placed.includes(index);
      control.disabled = used || complete;
      control.classList.toggle('is-used', used);
      control.setAttribute('aria-label', (used ? 'Placed: ' : complete ? 'Not needed: ' : 'Place ') + pieceName(step().pieces[index]) + ', piece ' + (index + 1) + ' of ' + step().pieces.length);
    });
    undo.disabled = reset.disabled = placed.length === 0;
    next.hidden = !complete || finalStep;
    replay.hidden = !complete || !finalStep;
    hintCopy.textContent = step().hint || 'Compare each piece with the space that remains. Undo returns a piece to the tray.';
  }
  function makeTray() {
    const rows = [];
    let row, occupied = WHOLE;
    step().pieces.forEach((units, index) => {
      // Each row has the same eight-unit scale as the bridge; spare pieces never shrink it.
      if (occupied + units > WHOLE) {
        row = node('div', 'player-tray-row');
        rows.push(row);
        occupied = 0;
      }
      const control = button('', 'player-piece', 'player-piece');
      control.append(fractionLabel(units));
      control.dataset.pieceIndex = index;
      control.dataset.units = units;
      control.style.gridColumn = 'span ' + units;
      control.setAttribute('aria-describedby', instruction.id);
      row.append(control);
      occupied += units;
    });
    tray.replaceChildren(...rows);
  }
  function place(index) {
    if (!Number.isInteger(index) || index < 0 || index >= step().pieces.length || placed.includes(index) || total() === WHOLE) return;
    const units = step().pieces[index], remaining = WHOLE - total();
    if (units > remaining) {
      cancelAnimationFrame(focusFrame);
      say('That piece is too long for the remaining gap.',
        'The gap needs ' + fraction(remaining) + '. Choose another piece or use Undo.');
      return; // Keep the piece available and the focus exactly where it was.
    }
    placed.push(index);
    render();
    if (total() === WHOLE) {
      const unused = step().pieces.length - placed.length;
      say('A whole bridge. The fox can cross!', placed.map(i => fraction(step().pieces[i])).join(' + ') + ' = 1 whole.' +
        (unused ? ' You did not need every piece.' : ''));
      focusAfterLayout(next.hidden ? replay : next);
      if (next.hidden && typeof onComplete === 'function') {
        onComplete({recipeId: recipe.id, stepId: step().id, stepIndex, stepCount: recipe.steps.length});
      }
    } else {
      say(fraction(total()) + ' filled.', fraction(WHOLE - total()) + ' remains. Choose another piece.');
      focusAfterLayout(pieceButtons().find(control => !control.disabled));
    }
  }
  function beginStep(moveFocus = false) {
    placed = [];
    hint.open = false;
    makeTray();
    render();
    const hasSparePieces = step().pieces.reduce((sum, units) => sum + units, 0) > WHOLE;
    say('Build one whole.', hasSparePieces ? 'Choose pieces; some can stay in the tray.' : 'Choose a piece.');
    if (moveFocus) focusAfterLayout(pieceButtons()[0]);
  }
  listen(tray, 'click', event => {
    const control = event.target.closest('button[data-piece-index]');
    if (control && tray.contains(control) && !control.disabled) place(Number(control.dataset.pieceIndex));
  });
  listen(player, 'focusin', keepBridgeWithFocus);
  listen(undo, 'click', () => {
    const index = placed.pop();
    if (index === undefined) return;
    render();
    say('Piece returned.', fraction(total()) + ' filled; ' + fraction(WHOLE - total()) + ' remains.');
    focusAfterLayout(pieceButtons()[index]);
  });
  listen(reset, 'click', () => beginStep(true));
  listen(next, 'click', () => {
    if (total() !== WHOLE || stepIndex >= recipe.steps.length - 1) return;
    stepIndex++;
    beginStep(true);
  });
  listen(replay, 'click', () => { stepIndex = 0; beginStep(true); });
  listen(scenery, 'load', () => {
    if (!destroyed) player.classList.add('has-art');
  });
  listen(scenery, 'error', () => {
    artFailed = true;
    player.classList.remove('has-art');
    graphicsNote.textContent = 'Illustration unavailable. The bridge still works in this simple setting.';
    graphicsNote.hidden = simpleView;
  });
  function setSimple(value) {
    if (destroyed) return;
    simpleView = Boolean(value);
    player.classList.toggle('is-simple', simpleView);
    graphicsNote.hidden = simpleView || !artFailed;
    if (!simpleView && !scenery.hasAttribute('src')) {
      scenery.src = new URL('../learning-lab/art/bridge-setting.png', import.meta.url).href;
    }
  }
  beginStep();
  setSimple(simpleView);
  return {
    setSimple,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(focusFrame);
      cancelAnimationFrame(contextFrame);
      events.abort();
      player.remove();
    },
  };
}
