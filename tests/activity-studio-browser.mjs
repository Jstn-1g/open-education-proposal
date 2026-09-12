// Optional local browser review. Uses an existing Playwright installation; no installs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleName = process.env.PLAYWRIGHT_MODULE_PATH || process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(moduleName ? pathToFileURL(moduleName).href : 'playwright');
const base = new URL(process.argv[2] || 'http://127.0.0.1:8775/');
assert(['127.0.0.1', 'localhost'].includes(base.hostname), 'Browser review is loopback only.');
assert.equal(base.protocol, 'http:', 'Use the reviewed local HTTP server.');
assert(base.pathname.endsWith('/') && !base.search && !base.hash && !base.username && !base.password,
  'Supply the project root URL, including its trailing slash.');
const studioBase = new URL('activity-studio/', base);
const artifacts = path.resolve(process.argv[3] || '.qa-activity-studio');
await mkdir(artifacts, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function manifest() {
  const response = await fetch(new URL('manifest.json', base), { redirect: 'error' });
  assert.equal(response.status, 200, 'A built artifact manifest is required.');
  const bytes = Buffer.from(await response.arrayBuffer());
  return { sha256: digest(bytes), files: JSON.parse(bytes).files };
}
const initialManifest = await manifest();
if (process.env.EXPECTED_MANIFEST_SHA256) assert.equal(initialManifest.sha256, process.env.EXPECTED_MANIFEST_SHA256);
const report = {
  started: new Date().toISOString(), base: base.href, manifest: initialManifest.sha256,
  sourceHashes: Object.fromEntries(Object.entries(initialManifest.files).filter(([name]) => name.startsWith('activity-studio/'))),
  checks: [], failures: [], contexts: [],
};
assert(Object.keys(report.sourceHashes).length > 0, 'The reviewed artifact must include Activity Studio.');
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const expanded = ':root{font-size:200%!important}*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-block-end:2em!important}';
let contextNumber = 0;

async function open(route, { width = 390, height = 900, large = false, simple = false, blockArt = false, denyClipboard = false, javaScriptEnabled = true, forcedColors = 'none', deviceScaleFactor = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, forcedColors, deviceScaleFactor,
    reducedMotion: 'reduce', hasTouch: width < 600, javaScriptEnabled, serviceWorkers: 'block' });
  const record = { number: ++contextNumber, route, width, height, large, simple, forcedColors, deviceScaleFactor, artFailures: 0, requests: [], blocked: [], pageErrors: [] };
  report.contexts.push(record);
  await context.addInitScript(() => {
    window.__activityAudit = { storageWrites: [], csp: [], payloadExecuted: false };
    document.addEventListener('securitypolicyviolation', event => window.__activityAudit.csp.push(event.violatedDirective));
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.__activityAudit.storageWrites.push(method);
        return original.apply(this, args);
      };
    }
  });
  if (denyClipboard) await context.addInitScript(() => {
    // Deliberately deny the synthetic test copy; never write the host clipboard.
    window.__activityClipboard = { calls: [] };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      async writeText(text) {
        window.__activityClipboard.calls.push(text);
        throw new DOMException('Clipboard access denied for this test.', 'NotAllowedError');
      },
    } });
  });
  await context.route('**/*', async request => {
    const target = new URL(request.request().url());
    record.requests.push(target.href);
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname) || request.request().method() !== 'GET') {
      record.blocked.push({ url: target.href, method: request.request().method() });
      return request.abort();
    }
    if (blockArt && target.pathname.includes('/art/')) {
      record.artFailures++;
      return request.abort();
    }
    if (large && target.pathname.endsWith('.css')) {
      const response = await request.fetch();
      return request.fulfill({ response, body: `${await response.text()}\n${expanded}` });
    }
    return request.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => record.pageErrors.push(error.message));
  const target = new URL(route, studioBase);
  if (simple) target.searchParams.set('view', 'simple');
  const response = await page.goto(target.href);
  assert.equal(response.status(), 200);
  return { page, context, record };
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function screenshot(page, name, selector) {
  await page.waitForFunction(() => [...document.querySelectorAll('.player-scenery[src]')].every(image => image.complete));
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: path.join(artifacts, `${name}.png`) });
}

async function layout(page, label) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    h1: document.querySelectorAll('h1').length,
    clipped: [...document.querySelectorAll('button,select,output')].filter(element =>
      element.checkVisibility({ checkVisibilityCSS: true }) && element.scrollWidth > element.clientWidth + 2)
      .map(element => element.id || element.textContent.trim()),
    clippedPieceLabels: [...document.querySelectorAll('.piece-counts label')].flatMap(label => {
      const box = label.getBoundingClientRect();
      return [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).flatMap(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        return text.left < box.left - 1 || text.right > box.right + 1
          ? [{ text: node.textContent.trim(), width: text.width, available: box.width }] : [];
      });
    }),
    scales: [...document.querySelectorAll('.activity-player')].map(player => ({
      whole: player.querySelector('[data-testid="player-bridge"]').getBoundingClientRect().width,
      pieces: [...player.querySelectorAll('[data-testid="player-piece"]')].map(piece => ({
        units: Number(piece.dataset.units), width: piece.getBoundingClientRect().width,
      })),
    })),
    smallTargets: [...document.querySelectorAll('[data-testid="player-piece"]')].filter(element =>
      !element.disabled && element.checkVisibility({ checkVisibilityCSS: true }) &&
      (element.getBoundingClientRect().width < 24 || element.getBoundingClientRect().height < 44))
      .map(element => ({ units: element.dataset.units, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
    clippedMath: [...document.querySelectorAll('.player-whole-label,.player-placed-piece,[data-testid="player-piece"]')]
      .filter(element => element.checkVisibility({ checkVisibilityCSS: true })).flatMap(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const text = range.getBoundingClientRect(), problems = [];
        for (let parent = element; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
          const ownBox = parent === element;
          if ((ownBox || ['hidden', 'clip'].includes(style.overflowX)) && (text.left < box.left - 1 || text.right > box.right + 1)
              || (ownBox || ['hidden', 'clip'].includes(style.overflowY)) && (text.top < box.top - 1 || text.bottom > box.bottom + 1)) {
            problems.push({ text: element.textContent.trim(), clippedBy: parent.className,
              textBox: { left: text.left, right: text.right, top: text.top, bottom: text.bottom },
              box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom } });
          }
        }
        return problems;
      }),
  }));
  assert(metrics.scroll <= metrics.width + 1, `${label}: horizontal overflow ${JSON.stringify(metrics)}`);
  assert.equal(metrics.h1, 1, `${label}: one main heading`);
  assert.deepEqual(metrics.clipped, [], `${label}: visible control labels must fit`);
  assert.deepEqual(metrics.clippedPieceLabels, [], `${label}: piece-count labels must not overlap neighboring controls`);
  assert.deepEqual(metrics.clippedMath, [], `${label}: visible fraction and whole-reference text must not be clipped`);
  assert.deepEqual(metrics.smallTargets, [], `${label}: actionable pieces need at least 24px width and 44px height; this is not a full accessibility conformance claim`);
  for (const scale of metrics.scales) for (const piece of scale.pieces) {
    assert(Math.abs(piece.width - scale.whole * piece.units / 8) <= 1,
      `${label}: tray pieces must use the bridge's fixed whole scale: ${JSON.stringify({ whole: scale.whole, piece })}`);
  }
  return metrics;
}

async function tabTo(page, target) {
  if (await target.evaluate(element => document.activeElement === element)) return;
  for (let index = 0; index < 100; index++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element => document.activeElement === element)) return;
  }
  assert.fail('The requested control was not reachable in a bounded native Tab walk.');
}

async function visibleFocus(page) {
  await settle(page);
  const state = await page.evaluate(() => {
    const element = document.activeElement, box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { testId: element.dataset.testid, id: element.id, piece: element.dataset.pieceIndex,
      visible: element.checkVisibility({ checkVisibilityCSS: true }), keyboard: element.matches(':focus-visible'),
      outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), top: box.top, bottom: box.bottom, viewportHeight: innerHeight };
  });
  assert(state.visible && state.top >= -1 && state.bottom <= state.viewportHeight + 1, `Focus must stay in view: ${JSON.stringify(state)}`);
  assert(state.keyboard && state.outline !== 'none' && state.outlineWidth >= 2,
    `Keyboard focus must have a visible outline: ${JSON.stringify(state)}`);
  return state;
}

async function skipLink(page) {
  const link = page.locator('.skip-link');
  const before = await link.boundingBox();
  assert(before.y + before.height <= 0, 'An unfocused skip link must be fully offscreen even when its text wraps.');
  await page.keyboard.press('Tab');
  assert(await link.evaluate(element => document.activeElement === element), 'The first Tab reaches the skip link, not an auto-focused player control.');
  const focused = await visibleFocus(page);
  await page.keyboard.press('Tab');
  assert(!(await link.evaluate(element => document.activeElement === element)));
  const after = await link.boundingBox();
  assert(after.y + after.height <= 0, 'After focus moves on, the skip link must not overlay the page.');
  return { unfocusedBottom: before.y + before.height, focused, afterBottom: after.y + after.height };
}

async function playerState(page, mount) {
  return page.locator(`${mount} .activity-player`).evaluate(element => ({
    step: Number(element.dataset.stepIndex), amount: Number(element.dataset.amount),
    text: element.innerText,
    pieces: [...element.querySelectorAll('[data-testid="player-piece"]')].map(button => ({
      index: Number(button.dataset.pieceIndex), units: Number(button.dataset.units), disabled: button.disabled,
    })),
    bridge: element.querySelector('[data-testid="player-bridge"]').getAttribute('aria-label'),
    feedback: element.querySelector('[data-testid="player-feedback"]').textContent,
  }));
}

async function fileInput(page, selector, text, name = 'activity.json', { preserveFocus = false } = {}) {
  const input = page.locator(selector);
  if (!(await input.isVisible())) {
    const disclosure = page.locator('details').filter({ has: input });
    if (await disclosure.count()) await disclosure.locator('summary').first().click();
  }
  const focused = preserveFocus ? await page.evaluateHandle(() => document.activeElement) : null;
  await input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
  await settle(page);
  if (focused) {
    assert(await focused.evaluate(element => element === document.activeElement), 'A rejected import must not move focus away from the importing control.');
    await focused.dispose();
  }
}

async function revealControl(page, selector) {
  for (const disclosure of await page.locator('details').filter({ has: page.locator(selector) }).all()) {
    if (!(await disclosure.evaluate(element => element.open))) await disclosure.locator(':scope > summary').click();
  }
}

async function recipeDownload(page, { confirmSaved = false } = {}) {
  const hadUnsavedEdits = /unsaved/i.test(await page.locator('#draft-status').innerText());
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-recipe').click()]);
  assert.equal(await download.failure(), null);
  assert(download.suggestedFilename().endsWith('.json'), 'Export is a JSON recipe.');
  const bytes = await readFile(await download.path());
  assert(bytes.length <= 32 * 1024, 'Export must respect the import size limit.');
  if (hadUnsavedEdits) assert(await page.locator('#confirm-saved').isVisible(), 'Downloading unsaved edits offers explicit saved-file confirmation.');
  if (confirmSaved && await page.locator('#confirm-saved').isVisible()) {
    await page.locator('#confirm-saved').click();
    assert(await page.locator('#confirm-saved').isHidden(), 'Confirmation is consumed for this version only.');
  }
  return { text: bytes.toString('utf8'), value: JSON.parse(bytes), filename: download.suggestedFilename(), sha256: digest(bytes) };
}

async function readyPlayer(page, mount) {
  await page.locator(`${mount} .activity-player [data-testid="player-piece"]`).first().waitFor();
  await settle(page);
}

async function amount(page, mount, expected) {
  await page.waitForFunction(({ mount, expected }) =>
    Number(document.querySelector(`${mount} .activity-player`)?.dataset.amount) === expected,
  { mount, expected });
}

async function choosePiece(page, mount, index, expected, keyboard = false) {
  const button = page.locator(`${mount} [data-testid="player-piece"][data-piece-index="${index}"]`);
  if (keyboard) {
    await tabTo(page, button);
    await visibleFocus(page);
    await page.keyboard.press(index % 2 ? 'Space' : 'Enter');
  } else if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await button.tap();
  else await button.click();
  await amount(page, mount, expected);
  await settle(page);
}

async function studioSnapshot(page) {
  return {
    fields: await page.locator('#studio-form input,#studio-form textarea,#studio-form select').evaluateAll(elements =>
      elements.map(element => ({ id: element.id, value: element.value }))),
    title: await page.locator('#activity-title').inputValue(),
    prompt: await page.locator('#step-prompt').inputValue(),
    player: await playerState(page, '#studio-preview'),
    pending: await page.locator('#preview-status').innerText(),
    dirty: await page.locator('#draft-status').innerText(),
  };
}

async function fieldError(page, selector) {
  const field = page.locator(selector), error = page.locator('#field-error');
  await error.waitFor();
  assert.equal(await field.getAttribute('aria-invalid'), 'true');
  assert((await field.getAttribute('aria-describedby') || '').split(/\s+/).includes('field-error'));
  assert(await field.evaluate(element => element === document.activeElement), 'Validation focuses the actual field needing correction.');
  assert(await field.isVisible(), 'Its disclosure ancestors must be open.');
  const box = await field.boundingBox();
  assert(box.y >= -1 && box.y + box.height <= page.viewportSize().height + 1, `Invalid field must be in view: ${JSON.stringify(box)}`);
  return { field: selector, message: await error.innerText(), box };
}

async function bridgeInView(page, label) {
  const box = await page.locator('#play-mount [data-testid="player-bridge"]').boundingBox();
  const viewport = page.viewportSize();
  assert(box && box.y >= -1 && box.y + box.height <= viewport.height + 1
    && box.x >= -1 && box.x + box.width <= viewport.width + 1,
  `${label}: the bridge being built must stay visible during native keyboard play: ${JSON.stringify({ box, viewport })}`);
  return box;
}

async function renderedGlyph(page, locator, name, borderTop = false) {
  const png = await locator.screenshot({ path: path.join(artifacts, name + '.png') });
  // Inspect the screenshot's actual pixels: forced-color backplates can erase
  // white glyphs even when computed foreground/background colors contrast.
  const pixels = await page.evaluate(async ({ bytes, borderTop }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const inset = Math.max(1, Math.round(devicePixelRatio));
    let dark = 0, bright = 0, sampled = 0;
    // Exclude the fraction rule and outer edges, so a border cannot masquerade as text.
    for (let y = borderTop ? inset * 2 : inset; y < height - inset; y++) {
      for (let x = inset; x < width - inset; x++) {
        const offset = (y * width + x) * 4;
        const lightness = (data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722) / 255;
        if (lightness < .3) dark++;
        if (lightness > .7) bright++;
        sampled++;
      }
    }
    return { width, height, sampled, dark, bright };
  }, { bytes: [...png], borderTop });
  assert(pixels.sampled > 0 && pixels.dark >= 5 && pixels.bright >= 5
    && pixels.dark / pixels.sampled > .02 && pixels.bright / pixels.sampled > .02,
  `${name}: actual glyph pixels must contrast with their backplate: ${JSON.stringify(pixels)}`);
  return pixels;
}

async function expectImportFailure(page, text, expectedSnapshot, dialogs) {
  const count = dialogs.length;
  await fileInput(page, '#import-recipe', text);
  await page.waitForFunction(() => /invalid|not valid|must|larger|32 KiB|could not|cannot|failed/i.test(document.querySelector('#studio-status').textContent));
  assert.equal(dialogs.length, count, 'Invalid imports must be rejected before asking to replace unsaved work.');
  assert.deepEqual(await studioSnapshot(page), expectedSnapshot, 'Invalid import must preserve form, draft state, and playable preview.');
  return await page.locator('#studio-status').innerText();
}

async function close(run) {
  assert.deepEqual(run.record.blocked, [], 'No nonlocal or mutating browser request may be attempted.');
  assert.deepEqual(run.record.pageErrors, [], 'No uncaught page error.');
  for (const page of run.context.pages()) {
    const observations = await page.evaluate(() => window.__activityAudit);
    if (observations) assert.deepEqual(observations, { storageWrites: [], csp: [], payloadExecuted: false });
  }
  await run.context.close();
}

async function group(name, route, options, test) {
  let run;
  try {
    run = await open(route, options);
    const detail = await test(run);
    await close(run); run = null;
    report.checks.push({ name, result: 'PASS', detail });
  } catch (error) {
    report.failures.push({ name, error: error.stack });
    if (run) await screenshot(run.page, `failure-${report.failures.length}`).catch(() => {});
    throw error;
  } finally {
    if (run) await run.context.close();
  }
}

try {
  for (const { width, large } of [{ width: 320 }, { width: 390 }, { width: 1365 }, { width: 320, large: true }]) {
    await group(`Library, editor and player layout ${width}${large ? ' enlarged/spacing' : ''}`, 'index.html', { width, large }, async ({ page }) => {
      const measurements = {};
      assert(await page.locator('a[href*="edit.html"]').count() > 0, 'Library exposes authoring.');
      assert(await page.locator('a[href*="play.html"]').count() > 0, 'Library exposes playable examples.');
      measurements.librarySkip = await skipLink(page);
      measurements.library = await layout(page, 'Library');
      await screenshot(page, `library-${width}${large ? '-large' : ''}`);
      assert.equal(await page.locator('#activity-library .activity-card').count(), 2);
      await page.locator('#activity-library .activity-card').first().getByRole('link', { name: /^Make a copy:/ }).click();
      await page.waitForURL(new URL('edit.html?example=first-crossing', studioBase).href);
      await readyPlayer(page, '#studio-preview');
      assert(await page.locator('#activity-title').isEnabled(), 'Editor is ready for local authoring.');
      measurements.editorSkip = await skipLink(page);
      measurements.editor = await layout(page, 'Editor');
      await screenshot(page, `editor-${width}${large ? '-large' : ''}`);
      await page.locator('.workspace-nav a[href="index.html"]').click();
      await page.locator('#activity-library .activity-card').first().getByRole('link', { name: /^Try activity:/ }).click();
      await page.waitForURL(new URL('play.html?example=first-crossing', studioBase).href);
      await readyPlayer(page, '#play-mount');
      await screenshot(page, `player-entry-${width}${large ? '-large' : ''}`);
      measurements.playerSkip = await skipLink(page);
      measurements.player = await layout(page, 'Player');
      assert(await page.locator('#play-about').evaluate(element => !element.open), 'Metadata is initially optional, below the activity.');
      assert(await page.locator('#play-simple').evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('#play-mount')) & Node.DOCUMENT_POSITION_FOLLOWING)));
      assert(await page.locator('#play-mount').evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('.play-controls')) & Node.DOCUMENT_POSITION_FOLLOWING)));
      const first = await playerState(page, '#play-mount');
      assert.deepEqual(first.pieces.map(piece => piece.units), [4, 4]);
      await choosePiece(page, '#play-mount', 0, 4);
      await choosePiece(page, '#play-mount', 1, 8);
      await page.locator('[data-testid="player-next"]').click();
      for (const index of [0, 1, 2, 3]) await choosePiece(page, '#play-mount', index, 2 * (index + 1));
      assert(await page.locator('[data-testid="player-replay"]').isVisible());
      measurements.completed = await layout(page, 'Completed player');
      await screenshot(page, `player-complete-${width}${large ? '-large' : ''}`, '#play-mount');
      await page.goto(new URL('play.html?example=another-way', studioBase).href);
      await readyPlayer(page, '#play-mount');
      for (const [index, total] of [[0, 4], [1, 6], [2, 8]]) await choosePiece(page, '#play-mount', index, total);
      await page.locator('[data-testid="player-next"]').click();
      assert.deepEqual((await playerState(page, '#play-mount')).pieces.map(piece => piece.units), [4, 4, 2, 2, 1, 1]);
      measurements.mixed = await layout(page, 'Mixed tray including eighths');
      await screenshot(page, `player-mixed-${width}${large ? '-large' : ''}`, '#play-mount');
      return measurements;
    });
  }

  await group('Native keyboard player and step recovery', 'play.html', { width: 390, simple: true }, async ({ page, record }) => {
    await readyPlayer(page, '#play-mount');
    const first = page.locator('[data-testid="player-piece"]').first();
    await tabTo(page, first); const firstFocus = await visibleFocus(page);
    await page.keyboard.press('Enter'); await amount(page, '#play-mount', 4); await settle(page);
    assert.equal((await visibleFocus(page)).piece, '1', 'Partial placement focuses the next available piece.');
    await page.keyboard.press('Space'); await amount(page, '#play-mount', 8); await settle(page);
    assert.equal((await visibleFocus(page)).testId, 'player-next', 'Completion focuses the explicit next-step action.');
    await page.keyboard.press('Enter'); await amount(page, '#play-mount', 0); await settle(page);
    assert.equal((await playerState(page, '#play-mount')).step, 1);
    assert.equal((await visibleFocus(page)).piece, '0');
    await page.keyboard.press('Space'); await amount(page, '#play-mount', 2);
    const undo = page.locator('[data-testid="player-undo"]');
    await tabTo(page, undo); await page.keyboard.press('Enter'); await amount(page, '#play-mount', 0); await settle(page);
    assert.equal((await visibleFocus(page)).piece, '0', 'Undo returns focus to the returned piece.');
    for (const index of [0, 1, 2, 3]) await choosePiece(page, '#play-mount', index, 2 * (index + 1), true);
    assert.equal((await visibleFocus(page)).testId, 'player-replay');
    await page.keyboard.press('Enter'); await amount(page, '#play-mount', 0);
    assert.equal((await playerState(page, '#play-mount')).step, 0);
    assert(!record.requests.some(url => /\/(art|vendor)\//.test(url)), 'Initial Simple must not download illustrations or engines.');
    await screenshot(page, 'keyboard-simple-replayed', '#play-mount');
    return { firstFocus, replay: await playerState(page, '#play-mount') };
  });

  await group('Malformed, oversize and invalid imports preserve unsaved work', 'edit.html', { width: 1365, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    const initial = await recipeDownload(page, { confirmSaved: true });
    await choosePiece(page, '#studio-preview', 0, 4);
    await page.locator('#activity-title').fill('Unsaved review draft');
    const validPlayer = await playerState(page, '#studio-preview');
    await page.locator('#piece-halves').fill('0');
    await page.locator('#preview-update').click();
    assert.deepEqual(await playerState(page, '#studio-preview'), validPlayer, 'Invalid form changes cannot replace the last valid preview.');
    assert.match(await page.locator('#studio-status').innerText(), /must|needs|invalid|could not|cannot|at least/i);
    await page.locator('#piece-halves').fill('2');
    const baseline = await studioSnapshot(page), dialogs = [];
    page.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
    assert.match(baseline.pending, /update|change|pending/i);
    assert.match(baseline.dirty, /unsaved|download|not saved/i);
    const failures = [];
    failures.push(await expectImportFailure(page, '{broken JSON', baseline, dialogs));
    failures.push(await expectImportFailure(page, ' '.repeat(32769), baseline, dialogs));
    failures.push(await expectImportFailure(page, JSON.stringify({ ...initial.value, approved: true }), baseline, dialogs));
    const impossible = structuredClone(initial.value); impossible.steps[0].pieces = [1, 1];
    failures.push(await expectImportFailure(page, JSON.stringify(impossible), baseline, dialogs));
    await fileInput(page, '#import-recipe', initial.text);
    assert.equal(dialogs.at(-1)?.type, 'confirm', 'Replacing dirty work needs confirmation.');
    assert.deepEqual(await studioSnapshot(page), baseline, 'Canceled valid import must preserve all current work.');
    await page.locator('.new-activity summary').click();
    await page.locator('#start-template').selectOption('another-way');
    await page.locator('#new-draft').click();
    assert.equal(dialogs.at(-1)?.type, 'confirm');
    assert.deepEqual(await studioSnapshot(page), baseline, 'Canceled template replacement also preserves unsaved work.');
    const beforeReload = dialogs.length;
    await page.reload({ timeout: 3000 }).catch(error => assert.match(error.message, /aborted|ERR_ABORTED|Timeout|cancel/i));
    assert.equal(dialogs.length, beforeReload + 1, 'Unsaved work must warn on attempted navigation.');
    assert.equal(dialogs.at(-1).type, 'beforeunload');
    assert.deepEqual(await studioSnapshot(page), baseline, 'Dismissing the dirty-navigation warning preserves work.');
    await screenshot(page, 'editor-invalid-import-preserves-draft');
    return { failures, dialogs, preserved: baseline };
  });

  await group('Literal text, explicit preview, export/import equivalence and overshoot recovery', 'edit.html', { width: 390, simple: true }, async ({ page, record }) => {
    await readyPlayer(page, '#studio-preview');
    const initial = await recipeDownload(page, { confirmSaved: true });
    const literalTitle = '<img src=x onerror="window.__activityAudit.payloadExecuted=true">';
    const literalPrompt = '<script>window.__activityAudit.payloadExecuted=true</script>';
    const initialPlayer = await playerState(page, '#studio-preview');
    await page.locator('#activity-title').fill(literalTitle);
    await page.locator('#step-prompt').fill(literalPrompt);
    await page.locator('#piece-halves').fill('2');
    await page.locator('#piece-quarters').fill('1');
    await page.locator('#piece-eighths').fill('0');
    assert.deepEqual(await playerState(page, '#studio-preview'), initialPlayer, 'Editing alone does not silently reset or change the playable preview.');
    await page.locator('#preview-update').click(); await readyPlayer(page, '#studio-preview');
    const preview = await playerState(page, '#studio-preview');
    assert(preview.text.includes(literalPrompt), 'Imported or authored markup-like strings remain visible plain text.');
    assert.deepEqual(preview.pieces.map(piece => piece.units), [4, 4, 2]);
    assert.equal(await page.locator('img[src="x"],[onerror],script:not([src])').count(), 0, 'Recipe text must not become DOM markup.');
    const saved = await recipeDownload(page, { confirmSaved: true });
    assert.equal(saved.value.title, literalTitle);
    assert.equal(saved.value.steps[0].prompt, literalPrompt);
    assert.equal(saved.value.license, 'CC-BY-4.0');
    assert.equal(saved.value.attribution, initial.value.attribution, 'Remix export preserves source attribution.');
    const dialogs = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
    await page.goto(new URL('play.html?view=simple', studioBase).href);
    assert.deepEqual(dialogs, [], 'An explicitly confirmed, unchanged downloaded draft is no longer dirty.');
    await readyPlayer(page, '#play-mount');
    await fileInput(page, '#play-file', saved.text, saved.filename);
    await page.waitForFunction(title => document.querySelector('#play-title').textContent === title, literalTitle);
    assert.equal(await page.locator('#play-title').innerText(), literalTitle);
    assert(await page.locator('#play-title').evaluate(element => element === document.activeElement && element.tabIndex === -1), 'An explicit valid import returns attention to the new activity.');
    const importedTitleBox = await page.locator('#play-title').boundingBox();
    assert(importedTitleBox.y >= -1 && importedTitleBox.y + importedTitleBox.height <= 901, 'The newly imported title is brought into view.');
    await page.locator('#play-about > summary').click();
    assert((await page.locator('#play-metadata').innerText()).includes(saved.value.attribution), 'Opening activity details exposes the preserved attribution.');
    await page.locator('#play-about > summary').click();
    const imported = await playerState(page, '#play-mount');
    assert.deepEqual(imported, preview, 'Standalone player and editor preview must agree for the exported recipe.');
    assert.equal(await page.locator('img[src="x"],[onerror],script:not([src])').count(), 0);
    await choosePiece(page, '#play-mount', 0, 4);
    await choosePiece(page, '#play-mount', 2, 6);
    const before = await playerState(page, '#play-mount');
    await page.locator('[data-testid="player-piece"][data-piece-index="1"]').click();
    await settle(page);
    const rejected = await playerState(page, '#play-mount');
    assert.equal(rejected.amount, 6, 'An oversized piece cannot overfill the bridge.');
    assert.deepEqual(rejected.pieces, before.pieces, 'Rejection consumes no tray piece.');
    assert.match(rejected.feedback, /too long|does not fit|won.t fit/i);
    assert.equal(await page.locator('[data-testid="player-piece"][data-piece-index="1"]').evaluate(element => document.activeElement === element), true);
    await screenshot(page, 'player-mixed-overshoot', '#play-mount');
    await page.locator('[data-testid="player-undo"]').click(); await amount(page, '#play-mount', 4);
    await choosePiece(page, '#play-mount', 1, 8);
    assert.match((await playerState(page, '#play-mount')).feedback, /1 whole/);
    const completed = await playerState(page, '#play-mount');
    await fileInput(page, '#play-file', '{bad', 'activity.json', { preserveFocus: true });
    assert.deepEqual(await playerState(page, '#play-mount'), completed, 'Invalid standalone import preserves the current activity.');
    assert.match(await page.locator('#play-status').innerText(), /unchanged/i);
    assert(!record.requests.some(url => /\/(art|vendor)\//.test(url)), 'Initial Simple authoring and playback load no art.');
    await layout(page, 'Literal imported text');
    return { export: { filename: saved.filename, sha256: saved.sha256 }, equivalent: true, overshoot: rejected };
  });

  await group('No-JavaScript and unknown-example boundaries', 'index.html', { width: 320, javaScriptEnabled: false }, async ({ page }) => {
    const routes = {};
    for (const route of ['index.html', 'edit.html', 'play.html']) {
      await page.goto(new URL(route, studioBase).href);
      assert((await page.locator('body').innerText()).trim().length > 100, `${route}: meaningful static content`);
      if (route !== 'index.html') {
        assert(await page.locator('noscript').isVisible(), `${route}: explicit no-JavaScript guidance`);
        assert.equal(await page.locator('input:enabled:visible,button:enabled:visible,textarea:enabled:not([readonly]):visible').count(), 0,
          `${route}: unavailable actions must not appear operable`);
      }
      routes[route] = await layout(page, route);
    }
    await screenshot(page, 'player-no-javascript');
    return routes;
  });

  await group('Unknown examples fail closed', 'play.html?example=not-a-known-example', { width: 390 }, async ({ page }) => {
    await page.locator('#play-file:not([disabled])').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.activity-player').count(), 0);
    assert.match(await page.locator('#play-status').innerText(), /known example|could not/i);
    await page.goto(new URL('edit.html?example=not-a-known-example', studioBase).href);
    assert.match(await page.locator('#studio-status').innerText(), /known example|could not|choose|invalid/i);
    assert.equal(await page.locator('#studio-preview .activity-player').count(), 0);
    return { closed: true };
  });

  await group('Unavailable illustration preserves the native activity', 'play.html', { width: 320, blockArt: true }, async ({ page, record }) => {
    await readyPlayer(page, '#play-mount');
    await page.locator('.player-graphics-note').waitFor();
    assert.match(await page.locator('.player-graphics-note').innerText(), /unavailable|simple/i);
    await choosePiece(page, '#play-mount', 0, 4);
    const before = await playerState(page, '#play-mount');
    await page.locator('#play-simple').check();
    const after = await playerState(page, '#play-mount');
    for (const key of ['step', 'amount', 'pieces', 'bridge', 'feedback']) {
      assert.deepEqual(after[key], before[key], `Simple mode preserves construction ${key}.`);
    }
    await choosePiece(page, '#play-mount', 1, 8);
    assert(record.artFailures > 0, 'The test must actually simulate a failed illustration request.');
    await layout(page, 'Unavailable illustration');
    await screenshot(page, 'player-illustration-fallback', '#play-mount');
    return { artFailures: record.artFailures, result: await playerState(page, '#play-mount') };
  });

  await group('Authoring challenge limits and removable draft steps', 'edit.html', { width: 390, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    for (let index = 0; index < 3; index++) await page.locator('#add-step').click();
    assert.equal(await page.locator('#step-list button').count(), 5);
    assert(await page.locator('#add-step').isDisabled(), 'Five steps is the current supported recipe limit.');
    await page.locator('#step-prompt').fill('Choose pieces to fill the same whole.');
    const five = await recipeDownload(page, { confirmSaved: true });
    assert.equal(five.value.steps.length, 5);
    assert.equal(new Set(five.value.steps.map(step => step.id)).size, 5);
    assert.equal(five.value.steps[4].prompt, 'Choose pieces to fill the same whole.');
    const firstDialog = page.waitForEvent('dialog');
    await Promise.all([firstDialog.then(dialog => dialog.dismiss()), page.locator('#remove-step').click()]);
    assert.equal(await page.locator('#step-list button').count(), 5, 'Canceled removal preserves the challenge.');
    for (let index = 0; index < 4; index++) {
      const dialog = page.waitForEvent('dialog');
      await Promise.all([dialog.then(value => value.accept()), page.locator('#remove-step').click()]);
    }
    assert.equal(await page.locator('#step-list button').count(), 1);
    assert(await page.locator('#remove-step').isDisabled(), 'One usable challenge must remain.');
    await page.locator('#preview-update').click();
    for (const index of [0, 1]) await choosePiece(page, '#studio-preview', index, 4 * (index + 1));
    assert(await page.locator('#studio-preview [data-testid="player-replay"]').isVisible());
    assert(await page.locator('#studio-preview [data-testid="player-next"]').isHidden());
    const one = await recipeDownload(page, { confirmSaved: true });
    assert.equal(one.value.steps.length, 1);
    await screenshot(page, 'editor-single-challenge-preview', '#studio-preview');
    return { maximum: five.value.steps.length, minimum: one.value.steps.length, file: one.sha256 };
  });

  await group('Long inherited credit has an explicit recoverable path', 'edit.html', { width: 320, large: true, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    const fixture = (await recipeDownload(page, { confirmSaved: true })).value;
    fixture.attribution = 'Prior authors and local sources; CC BY 4.0. '.repeat(20).slice(0, 599) + 'X';
    await fileInput(page, '#import-recipe', JSON.stringify(fixture));
    await page.waitForFunction(credit => document.querySelector('#activity-attribution').textContent === credit, fixture.attribution);
    await choosePiece(page, '#studio-preview', 0, 4);
    const playing = await playerState(page, '#studio-preview');
    await revealControl(page, '#activity-author');
    await page.locator('#activity-author').fill('QA reviewer');
    await page.locator('#preview-update').click();
    assert.match(await page.locator('#studio-status').innerText(), /600.*Consolidate|600.*shorten/i);
    assert.deepEqual(await playerState(page, '#studio-preview'), playing, 'Credit validation failure preserves the current playable preview.');
    await fieldError(page, '#activity-credit');
    await screenshot(page, 'editor-credit-error-320-large');
    await revealControl(page, '#activity-credit');
    const consolidated = 'Adapted by QA reviewer from Open Education proposal; original sources: local test fixture; CC BY 4.0.';
    await page.locator('#activity-credit').fill(consolidated);
    await page.locator('#preview-update').click(); await amount(page, '#studio-preview', 0);
    assert.equal(await page.locator('#activity-attribution').textContent(), fixture.attribution, 'Original inherited credit remains available for comparison.');
    const result = await recipeDownload(page, { confirmSaved: true });
    assert.equal(result.value.author, 'QA reviewer');
    assert.equal(result.value.attribution, consolidated);
    await screenshot(page, 'editor-credit-recovery');
    return { originalLength: fixture.attribution.length, exportedLength: result.value.attribution.length, recovered: true };
  });

  await group('Imported tray order and invalid author input survive editing', 'edit.html', { width: 390, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    const recipe = (await recipeDownload(page, { confirmSaved: true })).value;
    recipe.steps[0].pieces = [2, 4, 2];
    await fileInput(page, '#import-recipe', JSON.stringify(recipe));
    await page.waitForFunction(() => document.querySelector('#studio-preview [data-testid="player-piece"]')?.dataset.units === '2');
    const originalOrder = (await recipeDownload(page, { confirmSaved: true })).value.steps[0].pieces;
    assert.deepEqual(originalOrder, [2, 4, 2], 'Download alone must not reorder an imported tray.');
    await page.locator('#activity-title').fill('A metadata-only remix');
    assert.deepEqual((await recipeDownload(page, { confirmSaved: true })).value.steps[0].pieces, [2, 4, 2]);
    const playing = await playerState(page, '#studio-preview');
    await page.locator('#step-prompt').fill('Keep this prompt while correcting the count.');
    await page.locator('#piece-halves').fill('1.5');
    await page.locator('#step-list [data-step-index="1"]').click();
    assert.equal(await page.locator('#piece-halves').inputValue(), '1.5');
    assert.equal(await page.locator('#step-list [data-step-index="0"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#step-prompt').inputValue(), 'Keep this prompt while correcting the count.');
    assert.match(await page.locator('#studio-status').innerText(), /whole-number/);
    await page.locator('#add-step').click();
    assert.equal(await page.locator('#step-list button').count(), 2);
    assert.equal(await page.locator('#piece-halves').inputValue(), '1.5');
    assert.deepEqual(await playerState(page, '#studio-preview'), playing, 'Invalid author counts cannot affect the last valid player.');
    await page.locator('#piece-halves').fill('1');
    await page.locator('#step-list [data-step-index="1"]').click();
    await page.locator('#step-list [data-step-index="0"]').click();
    assert.equal(await page.locator('#step-prompt').inputValue(), 'Keep this prompt while correcting the count.');
    const recovered = await recipeDownload(page, { confirmSaved: true });
    assert.deepEqual(recovered.value.steps[0].pieces, [2, 4, 2]);
    return { originalOrder, rawFractionalCountPreserved: true, recoveredOrder: recovered.value.steps[0].pieces };
  });

  await group('Current challenge preview, preserved keyboard focus and full-sequence replay', 'edit.html', { width: 390, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    await page.locator('#add-step').click();
    const second = page.locator('#step-list [data-step-index="1"]');
    await tabTo(page, second); await page.keyboard.press('Enter'); await settle(page);
    assert.equal(await second.getAttribute('aria-pressed'), 'true');
    assert(await second.evaluate(element => element === document.activeElement), 'Rebuilding the step choices must retain focus on the selected replacement button.');
    const tabFocus = await visibleFocus(page);
    const prompt = await page.locator('#step-prompt').inputValue();
    await tabTo(page, page.locator('#preview-update')); await page.keyboard.press('Enter'); await readyPlayer(page, '#studio-preview');
    const entry = await playerState(page, '#studio-preview');
    assert.equal(entry.step, 1);
    assert.deepEqual(entry.pieces.map(piece => piece.units), [2, 2, 2, 2]);
    assert.equal(await page.locator('#studio-preview .player-heading').innerText(), prompt);
    assert(await page.locator('#studio-preview .player-heading').evaluate(element => element === document.activeElement));
    const headingFocus = await visibleFocus(page);
    for (const index of [0, 1, 2, 3]) await choosePiece(page, '#studio-preview', index, 2 * (index + 1));
    await page.locator('#studio-preview [data-testid="player-next"]').click();
    assert.equal((await playerState(page, '#studio-preview')).step, 2, 'The selected entry retains later challenges.');
    for (const [index, total] of [[0, 4], [1, 6], [2, 8]]) await choosePiece(page, '#studio-preview', index, total);
    await page.locator('#studio-preview [data-testid="player-replay"]').click();
    assert.equal((await playerState(page, '#studio-preview')).step, 0, 'Replay returns to the original beginning, not the selected entry.');
    await page.locator('#preview-update').click();
    await choosePiece(page, '#studio-preview', 0, 2);
    const construction = await playerState(page, '#studio-preview');
    await page.locator('#edit-current-step').click();
    assert(await page.locator('#step-prompt').evaluate(element => element === document.activeElement));
    assert.deepEqual(await playerState(page, '#studio-preview'), construction, 'Returning to editing does not reset play.');
    await page.locator('#preview-all').click();
    assert.equal((await playerState(page, '#studio-preview')).step, 0);
    assert.equal(await second.getAttribute('aria-pressed'), 'true', 'Trying from the beginning does not discard the editing selection.');
    await screenshot(page, 'editor-current-challenge-focus');
    return { tabFocus, headingFocus, selectedEntry: entry.step, laterStep: 2, replay: 0 };
  });

  await group('Player startStep bounds are checked before replacing DOM', 'play.html', { width: 390, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#play-mount');
    const result = await page.evaluate(async () => {
      const { mountPlayer } = await import('./player.mjs');
      const { getExample } = await import('./examples.mjs');
      const recipe = getExample('first-crossing'), invalids = [-1, 2, 1.5, NaN, Infinity, '1', null, true];
      const cases = invalids.map(startStep => {
        const root = document.createElement('div'); root.textContent = 'Preserve this existing content.';
        let error;
        try { mountPlayer(root, recipe, { simple: true, startStep }); } catch (failure) { error = failure.name; }
        return { value: String(startStep), error, unchanged: root.textContent === 'Preserve this existing content.' };
      });
      const root = document.createElement('div'), player = mountPlayer(root, recipe, { simple: true, startStep: 1 });
      const entry = root.querySelector('.activity-player').dataset.stepIndex;
      player.destroy();
      return { cases, entry };
    });
    assert(result.cases.every(item => item.error === 'RangeError' && item.unchanged), JSON.stringify(result));
    assert.equal(result.entry, '1');
    return result;
  });

  await group('Contribution disclosure and denied clipboard never expose stale copy as current', 'edit.html', { width: 390, simple: true, denyClipboard: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    await page.locator('a[href="#share-draft"]').click();
    assert(await page.locator('#share-draft').evaluate(element => element.open), 'The contribution link must open its instructions.');
    assert(await page.locator('#copy-recipe').isVisible());
    await page.goto(new URL('edit.html?view=simple#share-draft', studioBase).href);
    await readyPlayer(page, '#studio-preview');
    assert(await page.locator('#share-draft').evaluate(element => element.open), 'Direct hash entry also opens the instructions.');
    await page.locator('#share-draft > summary').click();
    assert(await page.locator('#share-draft').evaluate(element => !element.open));
    await page.locator('a[href="#share-draft"]').click();
    assert(await page.locator('#share-draft').evaluate(element => element.open), 'Reusing the same hash link reopens manually closed instructions.');
    const initial = await playerState(page, '#studio-preview');
    const oldJSON = await page.locator('#recipe-json').inputValue();
    await page.locator('#activity-title').fill('');
    await page.locator('#copy-recipe').click();
    const invalid = await fieldError(page, '#activity-title');
    assert.equal(await page.evaluate(() => window.__activityClipboard.calls.length), 0, 'Invalid data cannot reach the clipboard boundary.');
    assert.equal(await page.locator('#recipe-json').evaluate(element => element === document.activeElement), false);
    assert(!(await page.locator('#recipe-json').evaluate(element =>
      element.selectionStart === 0 && element.selectionEnd === element.value.length && element.value.length > 0)), 'Validation failure must not select the old recipe for copying.');
    await page.locator('#activity-title').fill('Current clipboard-denied draft');
    await page.locator('#copy-recipe').click();
    await page.waitForFunction(() => document.activeElement.id === 'recipe-json');
    const fallback = await page.locator('#recipe-json').evaluate(element => ({ text: element.value, start: element.selectionStart, end: element.selectionEnd }));
    assert.notEqual(fallback.text, oldJSON);
    assert.equal(JSON.parse(fallback.text).title, 'Current clipboard-denied draft');
    assert.equal(fallback.start, 0); assert.equal(fallback.end, fallback.text.length);
    assert.deepEqual(await page.evaluate(() => window.__activityClipboard.calls), [fallback.text]);
    assert(await page.locator('#share-draft').evaluate(element => element.open));
    assert.match(await page.locator('#draft-status').innerText(), /unsaved/i, 'Copying cannot confirm that a draft is saved.');
    assert.deepEqual(await playerState(page, '#studio-preview'), initial, 'Copy does not replace the playing version.');
    await screenshot(page, 'editor-copy-denied-current-json');
    return { invalid, deniedCopyWasCurrent: true, selectedCharacters: fallback.end, hostClipboardWritten: false };
  });

  await group('Contextual validation reveals and recovers collapsed fields', 'edit.html', { width: 320, large: true, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    await page.locator('#piece-halves').fill('1.5');
    await page.locator('#preview-update').click();
    const count = await fieldError(page, '#piece-halves');
    const countGroup = await page.locator('.piece-counts').boundingBox();
    const countError = await page.locator('#field-error').boundingBox();
    assert(countError.width >= countGroup.width - 2, 'Count recovery instructions need the full group width, not a narrow input column.');
    const firstErrorLineBottom = await page.locator('#field-error').evaluate(element => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().top + parseFloat(style.paddingTop) + parseFloat(style.lineHeight);
    });
    assert(countError.y >= -1 && firstErrorLineBottom <= 901, 'The beginning of count recovery guidance must be visible alongside the focused input.');
    await layout(page, 'Enlarged invalid piece count');
    await screenshot(page, 'editor-count-error-320-large');
    await page.locator('#piece-halves').fill('2');
    assert(await page.locator('#field-error').isHidden());
    await page.locator('#step-prompt').fill('');
    await page.locator('#step-list [data-step-index="1"]').click();
    await page.locator('#preview-update').click();
    const inactiveStep = await fieldError(page, '#step-prompt');
    assert.equal(await page.locator('#step-list [data-step-index="0"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#step-prompt').fill('Recovered first challenge.');
    assert(await page.locator('#field-error').isHidden());
    assert.notEqual(await page.locator('#step-prompt').getAttribute('aria-invalid'), 'true');
    await revealControl(page, '#activity-goal');
    await page.locator('#activity-goal').fill('');
    await page.locator('details').filter({ has: page.locator('#activity-goal') }).locator(':scope > summary').click();
    assert(await page.locator('#activity-goal').isHidden());
    await page.locator('#preview-update').click();
    const goal = await fieldError(page, '#activity-goal');
    await screenshot(page, 'editor-contextual-error-320-large');
    await page.locator('#activity-goal').fill('Notice that equal parts refer to the same whole.');
    assert(await page.locator('#field-error').isHidden());
    await page.locator('#preview-update').click();
    assert.equal(await page.locator('#studio-preview .player-heading').innerText(), 'Recovered first challenge.');
    await layout(page, 'Recovered contextual error');
    return { count, countErrorWidth: countError.width, firstErrorLineBottom, inactiveStep, goal, recovered: true };
  });

  await group('Only explicit confirmation of the current download clears unsaved work', 'edit.html', { width: 390, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    await page.locator('#activity-title').fill('Unconfirmed download version');
    const unconfirmed = await recipeDownload(page);
    assert.match(await page.locator('#draft-status').innerText(), /unsaved|confirm|download/i);
    const dialogs = [];
    const handler = async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); };
    page.on('dialog', handler);
    await page.reload({ timeout: 3000 }).catch(error => assert.match(error.message, /aborted|ERR_ABORTED|Timeout|cancel/i));
    assert.deepEqual(dialogs, ['beforeunload'], 'A download request alone cannot remove the loss-of-work warning.');
    assert.equal(await page.locator('#activity-title').inputValue(), 'Unconfirmed download version');
    await page.locator('#activity-title').fill('Changed after download');
    assert(await page.locator('#confirm-saved').isHidden(), 'Any newer edit invalidates confirmation for an older file.');
    assert.match(await page.locator('#draft-status').innerText(), /unsaved/i);
    const confirmed = await recipeDownload(page, { confirmSaved: true });
    assert.notEqual(confirmed.sha256, unconfirmed.sha256);
    const count = dialogs.length;
    await page.goto(new URL('index.html', studioBase).href);
    assert.equal(dialogs.length, count, 'Explicitly confirming the current version allows navigation.');
    page.off('dialog', handler);
    return { unconfirmed: unconfirmed.sha256, confirmed: confirmed.sha256, warnedBeforeConfirmation: true };
  });

  for (const simple of [false, true]) {
    await group(`Native short-landscape bridge visibility${simple ? ' in Simple view' : ''}`, 'play.html', { width: 844, height: 390, simple }, async ({ page }) => {
      await readyPlayer(page, '#play-mount');
      // Reproduce a visitor's unassisted keyboard sequence, without focus(),
      // clicks, locator screenshots, or scrolling to repair the viewport.
      for (let index = 0; index < 6; index++) await page.keyboard.press('Tab');
      const first = await visibleFocus(page);
      assert.equal(first.piece, '0', 'Six native Tabs reach the first piece.');
      const entry = await bridgeInView(page, 'First-piece focus');
      await page.screenshot({ path: path.join(artifacts, `landscape-${simple ? 'simple' : 'illustrated'}-entry.png`) });
      await page.keyboard.press('Enter'); await amount(page, '#play-mount', 4); await settle(page);
      assert.equal((await visibleFocus(page)).piece, '1');
      const halfway = await bridgeInView(page, 'After placing one half');
      await page.screenshot({ path: path.join(artifacts, `landscape-${simple ? 'simple' : 'illustrated'}-half.png`) });
      await page.keyboard.press('Space'); await amount(page, '#play-mount', 8); await settle(page);
      const completedFocus = await visibleFocus(page);
      assert.equal(completedFocus.testId, 'player-next');
      const complete = await bridgeInView(page, 'Completion and Next-step focus');
      await page.screenshot({ path: path.join(artifacts, `landscape-${simple ? 'simple' : 'illustrated'}-complete.png`) });
      await layout(page, 'Short-landscape native play');
      return { nativeTabs: 6, entry, halfway, complete, completedFocus };
    });
  }

  await group('Forced-color fraction glyphs survive actual screenshot rendering', 'play.html', { width: 390, height: 568, forcedColors: 'active', deviceScaleFactor: 2 }, async ({ page }) => {
    await readyPlayer(page, '#play-mount');
    assert(await page.locator('#play-simple').isChecked());
    for (let index = 0; index < 6; index++) await page.keyboard.press('Tab');
    assert.equal((await visibleFocus(page)).piece, '0');
    await page.keyboard.press('Enter'); await amount(page, '#play-mount', 4); await settle(page);
    await screenshot(page, 'forced-placed-bridge-2x', '#play-mount [data-testid="player-bridge"]');
    await screenshot(page, 'forced-available-tray-2x', '#play-mount [data-testid="player-tray"]');
    const placed = page.locator('#play-mount .player-placed-piece').first();
    const available = page.locator('#play-mount [data-testid="player-piece"]:not(:disabled)').first();
    const pixelEvidence = {};
    for (const [role, element] of [['placed', placed], ['available', available]]) {
      for (const part of ['numerator', 'denominator']) {
        pixelEvidence[role + '-' + part] = await renderedGlyph(page, element.locator('.player-' + part), `forced-${role}-${part}-2x`, part === 'denominator');
      }
    }
    assert.match((await playerState(page, '#play-mount')).bridge, /1\/2/);
    await screenshot(page, 'forced-color-page-390');
    return { actualScreenshotPixels: pixelEvidence, computedColorsOnly: false };
  });

  await group('Live forced-colors changes preserve the editor draft and construction', 'edit.html', { width: 390 }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    assert(!(await page.locator('#studio-simple').isChecked()));
    await choosePiece(page, '#studio-preview', 0, 4);
    const before = await studioSnapshot(page);
    await page.emulateMedia({ forcedColors: 'active' });
    await page.waitForFunction(() => document.querySelector('#studio-simple').checked);
    const after = await studioSnapshot(page);
    for (const key of ['fields', 'title', 'prompt', 'pending', 'dirty']) assert.deepEqual(after[key], before[key], `Forced colors preserve ${key}.`);
    for (const key of ['step', 'amount', 'pieces', 'bridge', 'feedback']) assert.deepEqual(after.player[key], before.player[key], `Forced colors preserve construction ${key}.`);
    assert(await page.locator('#studio-preview .activity-player').evaluate(element => element.classList.contains('is-simple')));
    await screenshot(page, 'editor-live-forced-colors', '#studio-preview');
    await page.emulateMedia({ forcedColors: 'none' });
    assert(await page.locator('#studio-simple').isChecked(), 'Returning to the normal palette retains the chosen Simple view.');
    await choosePiece(page, '#studio-preview', 1, 8);
    return { before: before.player.amount, after: after.player.amount, completed: 8, fieldsPreserved: true };
  });

  await group('Persistent draft status and per-challenge hint review survive editing and export', 'edit.html', { width: 390, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    const badge = page.locator('#draft-review-status'), review = page.locator('#tray-review-note');
    assert(await badge.isVisible()); assert.match(await badge.innerText(), /unreviewed/i);
    await revealControl(page, '#recipe-json');
    assert.match(await page.locator('label[for="recipe-json"]').innerText(), /^Activity file text\b/);
    assert(await review.isHidden());
    const originalHint = await page.locator('#step-hint').inputValue();
    await page.locator('#piece-halves').fill('1');
    await page.locator('#piece-quarters').fill('2');
    assert(await review.isVisible());
    await page.locator('#review-step-hint').click();
    assert(await page.locator('#step-hint').isVisible());
    assert(await page.locator('#step-hint').evaluate(element => document.activeElement === element));
    assert.equal(await page.locator('#step-hint').inputValue(), originalHint, 'Review action must preserve the author’s actual words.');
    await page.locator('#preview-update').click();
    assert(await review.isVisible(), 'Previewing does not certify the existing hint.');
    assert(await badge.isVisible()); assert.match(await badge.innerText(), /unreviewed/i);
    const saved = await recipeDownload(page, { confirmSaved: true });
    assert.equal(saved.value.id, 'first-crossing');
    assert.deepEqual(saved.value.steps[0].pieces, [4, 2, 2]);
    assert.equal(saved.value.steps[0].hint, originalHint);
    assert(await review.isVisible(), 'Downloading does not certify the existing hint.');
    await page.locator('#step-list [data-step-index="1"]').click();
    assert(await review.isHidden(), 'An untouched challenge does not inherit another challenge’s reminder.');
    await page.locator('#step-list [data-step-index="0"]').click();
    assert(await review.isVisible(), 'Returning to the changed challenge retains its reminder.');
    await screenshot(page, 'editor-hint-review-reminder');
    await fileInput(page, '#import-recipe', saved.text, saved.filename);
    assert(await review.isHidden(), 'Loading an activity starts a fresh authoring review session.');
    assert(await badge.isVisible()); assert.match(await badge.innerText(), /unreviewed/i);
    return { originalHintPreserved: true, reminderSurvived: ['preview', 'download', 'step change'], resetOnLoad: true, recipeId: saved.value.id };
  });

  await group('Distinct safe download names preserve recipe identity and reopen correctly', 'edit.html', { width: 390, simple: true }, async ({ page }) => {
    await readyPlayer(page, '#studio-preview');
    const cases = [
      ['Crème brûlée — fractions!', 'activity-creme-brulee-fractions.json'],
      ['CON', 'activity-con.json'],
      ['NUL', 'activity-nul.json'],
      ['../../AUX: <bad>|?*', 'activity-aux-bad.json'],
      ['🦊 🌉', 'activity-first-crossing.json'],
      ['... / : ? *', 'activity-first-crossing.json'],
      ['x'.repeat(63) + ' space', 'activity-' + 'x'.repeat(63) + '.json'],
      ['x'.repeat(64) + 'end', 'activity-' + 'x'.repeat(64) + '.json'],
    ];
    const downloads = [];
    let last;
    for (const [title, filename] of cases) {
      await page.locator('#activity-title').fill(title);
      const saved = await recipeDownload(page, { confirmSaved: true });
      assert.equal(saved.filename, filename);
      assert.equal(saved.value.id, 'first-crossing', 'A friendly file name must not silently change the recipe identity.');
      assert.equal(saved.value.title, title);
      assert.match(saved.filename, /^activity-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/);
      assert(saved.filename.length <= 'activity-'.length + 64 + '.json'.length);
      assert(await page.locator('#draft-review-status').isVisible());
      downloads.push({ title, filename, recipeId: saved.value.id, sha256: saved.sha256 });
      last = saved;
    }
    assert.notEqual(downloads[0].filename, downloads[1].filename, 'Different named remixes get distinguishable downloads.');
    await page.goto(new URL('play.html?view=simple', studioBase).href);
    await readyPlayer(page, '#play-mount');
    await fileInput(page, '#play-file', last.text, last.filename);
    await page.waitForFunction(title => document.querySelector('#play-title').textContent === title, last.value.title);
    assert.deepEqual((await playerState(page, '#play-mount')).pieces.map(piece => piece.units), last.value.steps[0].pieces);
    await screenshot(page, 'player-safe-filename-reopened');
    return { downloads, reopened: last.filename, identityPreserved: true };
  });
} finally {
  report.finished = new Date().toISOString();
  const finalManifest = await manifest();
  report.finalManifest = finalManifest.sha256;
  assert.equal(finalManifest.sha256, initialManifest.sha256, 'The built artifact must not change during review.');
  report.result = report.failures.length ? 'FAIL' : report.checks.length ? 'PASS' : 'INCOMPLETE';
  await writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ result: report.result, manifest: report.manifest, checks: report.checks.length,
    failures: report.failures, started: report.started, finished: report.finished }, null, 2));
  await browser.close();
}
