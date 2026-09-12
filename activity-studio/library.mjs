import { examples } from './examples.mjs';

const library = document.querySelector('#activity-library');
for (const {key, recipe} of examples) {
  const card = document.createElement('article');
  card.className = 'activity-card';
  const art = document.createElement('div'); art.className = 'card-art'; art.setAttribute('aria-hidden', 'true');
  const strip = document.createElement('div'); strip.className = 'card-bridge';
  for (const unit of (key === 'first-crossing' ? [4,4] : [4,2,2])) {
    const piece = document.createElement('span'); piece.style.gridColumn = 'span ' + unit; strip.append(piece);
  }
  art.append(strip);
  const body = document.createElement('div'); body.className = 'card-body';
  const label = document.createElement('p'); label.className = 'eyebrow'; label.textContent = 'Fractions · Visual construction';
  const heading = document.createElement('h3'); heading.textContent = recipe.title;
  const summary = document.createElement('p'); summary.textContent = recipe.summary;
  const detail = document.createElement('p'); detail.className = 'muted'; detail.textContent = recipe.steps.length + ' short challenges · Project example';
  const actions = document.createElement('div'); actions.className = 'card-actions';
  for (const [text, page, primary] of [['Try activity','play.html',true],['Make a copy','edit.html',false]]) {
    const link = document.createElement('a'); link.className = 'button ' + (primary ? 'button-primary' : 'button-secondary');
    link.href = page + '?example=' + encodeURIComponent(key); link.textContent = text;
    link.setAttribute('aria-label', text + ': ' + recipe.title); actions.append(link);
  }
  body.append(label, heading, summary, detail, actions); card.append(art, body); library.append(card);
}
