// The focused builder owns its own empty-to-whole construction, not legacy flags.
// A native button places each physical piece once; dragging is an optional shortcut.
import { amount, TOTAL } from './bridge.mjs';

export function createBuilder(root, heading, initialSimple) {
  const $ = selector => root.querySelector(selector);
  let units = 4, placed = [], dragging = null, simple = initialSimple, focusRevision = 0;
  const tray = $('#builder-tray'), bridge = $('#builder-bridge');
  const backdrop = $('.builder-backdrop');
  const word = () => units === 4 ? 'half' : 'quarter';
  const count = () => TOTAL / units;
  const total = () => amount(placed.map(() => units));
  function feedback(title, copy) {
    $('#builder-feedback-title').textContent = title;
    $('#builder-feedback-copy').textContent = copy;
  }
  function cancelDrag() { dragging = null; ++focusRevision; root.classList.remove('is-dragging'); }
  function focusAfterLayout(element) {
    const revision = ++focusRevision;
    // Let the embedded host receive its new height before native focus scrolls.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (revision === focusRevision && !root.closest('[hidden]') && element?.isConnected && !element.disabled) element.focus();
    }));
  }
  function render() {
    const full = total() === TOTAL;
    root.classList.toggle('is-complete', full);
    root.dataset.amount = total();
    root.dataset.pieceUnits = units;
    heading.textContent = full ? 'You built a whole bridge!' : 'Help the fox cross.';
    $('#builder-instruction').textContent = full ? 'A clear path to the other side.' : 'Tap a piece to place it in the gap.';
    $('#builder-placed').replaceChildren(...placed.map(() => {
      const piece = document.createElement('span');
      piece.style.gridColumn = 'span ' + units;
      return piece;
    }));
    bridge.setAttribute('aria-label', full ? 'One whole bridge, made from ' + count() + ' equal pieces. The fox can cross.' :
      'Bridge with ' + placed.length + ' of ' + count() + ' equal pieces placed. ' + (count() - placed.length) + (count() - placed.length === 1 ? ' more fills' : ' more fill') + ' the gap. The fox is waiting on the left.');
    [...tray.children].forEach((button, i) => {
      const used = placed.includes(i);
      button.disabled = used;
      button.classList.toggle('is-placed', used);
      button.setAttribute('aria-hidden', String(used));
    });
    $('#builder-undo').disabled = !placed.length;
    $('#builder-reset').disabled = !placed.length;
    $('.builder-recovery').hidden = !placed.length;
    $('#builder-next').hidden = !full;
    $('#builder-next').textContent = units === 4 ? 'Build with smaller pieces' : 'Build with halves again';
    $('#builder-piece-note').textContent = full ? 'Every piece fills an equal part of this bridge.' :
      units === 4 ? (placed.length ? 'One half left. Add it to the gap.' : 'Two equal pieces. Take either one.') : 'Smaller pieces · each is 1/4 of this bridge.';
  }
  function place(id) {
    if (!Number.isInteger(id) || id < 0 || id >= count() || placed.includes(id)) return;
    placed.push(id); cancelDrag(); render();
    if (total() === TOTAL) {
      feedback(units === 4 ? 'Two halves make one whole.' : 'Four quarters. The same whole bridge.',
        units === 4 ? '1/2 + 1/2 = 1 whole' : '4 quarters = 2 halves = 1 whole');
      focusAfterLayout(bridge);
    } else {
      feedback(units === 4 ? 'Halfway across.' : placed.length + ' of 4 quarters placed.',
        units === 4 ? 'This piece fills 1/2 of the bridge. Add the other half.' : (count() - placed.length) + ' more ' + (count() - placed.length === 1 ? 'piece fits.' : 'pieces fit.'));
      focusAfterLayout([...tray.children].find(button => !button.disabled));
    }
  }
  function makeTray() {
    tray.replaceChildren(...Array.from({length:count()}, (_, id) => {
      const button = document.createElement('button');
      button.type = 'button'; button.draggable = true;
      button.dataset.builderPiece = id;
      button.style.gridColumn = 'span ' + units;
      button.setAttribute('aria-label', 'Place one ' + word() + ', piece ' + (id + 1) + ' of ' + count());
      button.setAttribute('aria-describedby', 'builder-instruction');
      const plus = document.createElement('span'); plus.textContent = '+'; plus.setAttribute('aria-hidden', 'true');
      button.append(plus);
      button.addEventListener('click', () => place(id));
      button.addEventListener('dragstart', event => {
        if (placed.includes(id)) { event.preventDefault(); return; }
        cancelDrag();
        dragging = id; root.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', 'bridge-piece');
      });
      // Successful drop already cleared dragging and scheduled useful focus.
      // Only a cancelled/outside drag should invalidate that pending work.
      button.addEventListener('dragend', () => { if (dragging !== null) cancelDrag(); });
      return button;
    }));
  }
  bridge.addEventListener('dragover', event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = dragging === null ? 'none' : 'move';
  });
  bridge.addEventListener('drop', event => {
    event.preventDefault();
    if (dragging === null) return;
    place(dragging);
  });
  window.addEventListener('blur', cancelDrag);
  $('#builder-undo').addEventListener('click', () => {
    const id = placed.pop(); if (id === undefined) return;
    cancelDrag(); render(); feedback('Piece returned.', 'The fox waits until the whole gap is filled.');
    focusAfterLayout(tray.children[id]);
  });
  function reset() {
    cancelDrag(); placed = []; makeTray(); render(); feedback('', '');
    focusAfterLayout(tray.children[0]);
  }
  $('#builder-reset').addEventListener('click', reset);
  $('#builder-next').addEventListener('click', () => { units = units === 4 ? 2 : 4; reset(); });
  function setSimple(value) {
    simple = value; cancelDrag();
    root.classList.toggle('builder-simple', simple);
    if (!simple) {
      // No graphics requests at all for an initial Simple view.
      if (!backdrop.hasAttribute('src')) backdrop.src = new URL('./art/bridge-setting.png', import.meta.url).href;
    }
  }
  backdrop.addEventListener('load', () => { backdrop.hidden = false; });
  makeTray(); render(); setSimple(simple);
  return {setSimple, cancelDrag};
}
