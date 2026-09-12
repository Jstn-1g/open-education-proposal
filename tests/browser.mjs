// Optional browser review using an existing Playwright installation. No installs.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const moduleName = process.env.PLAYWRIGHT_MODULE_PATH;
const { chromium } = await import(moduleName ? pathToFileURL(moduleName).href : 'playwright');
const origin = process.argv[2] || 'http://127.0.0.1:8768/';
const url = new URL(origin);
assert(['127.0.0.1', 'localhost'].includes(url.hostname), 'Browser review is loopback only.');
const artifacts = process.argv[3];
if (artifacts) await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const routes = ['discussion', 'standard', 'open-source', 'contribute', 'governance', '404'];
const reports = [];
let accessibilityTreeChecks = 0;
let downloadChecks = 0;
let demoCaseChecks = 0;
let demoPrintChecks = 0;
let demoKeyboardFocusChecks = 0;
let contributionDisclosureChecks = 0;
let contributionPrintChecks = 0;
const demoCards = ['#demo-c1', '#demo-c2'];
const demoSummaryNames = {
  '#demo-c1': 'What can this response show? Compare two fractions.',
  '#demo-c2': 'What can this response show? Decode a printed word.',
};
const normalizeText = text => text.replace(/\s+/g, ' ').trim();

async function verifyContributionChoices(page) {
  const choices = page.locator('.contribute-choice');
  assert.equal(await choices.count(), 3, 'Offer three clear starting choices.');
  const expected = [new URL('activity-studio/index.html', origin).href,
    'https://github.com/Jstn-1g/open-education-proposal/issues/new?template=proposal-question.md',
    'https://github.com/Jstn-1g/open-education-proposal/issues/new?template=accessibility-barrier.md'];
  for (let index = 0; index < expected.length; index++) {
    const link = choices.nth(index).locator('a.button');
    assert(await link.isVisible(), 'First actions must not require a disclosure.');
    assert.equal(new URL(await link.getAttribute('href'), origin).href, expected[index]);
    assert((await link.boundingBox()).height >= 44, 'Contribution actions retain touch-sized targets.');
  }
  assert.match(await page.locator('.contribute-welcome').innerText(), /Adult participation only/);
  assert.match(await page.locator('.contribute-context').innerText(), /posting needs a GitHub account/);
  const tasks = page.locator('.contribute-task');
  assert.equal(await tasks.count(), 3);
  for (let index = 0; index < 3; index++) {
    const task = tasks.nth(index);
    const details = task.locator('details.contribute-criteria');
    assert.equal(await details.getAttribute('name'), null, 'Task criteria open independently.');
    assert(!(await details.evaluate(element => element.open)), 'Detailed criteria start collapsed.');
    assert(!(await task.locator('.contribute-criteria-print').isVisible()), 'No duplicate screen copy.');
    assert(await task.locator(`a[href="https://github.com/Jstn-1g/open-education-proposal/issues/${index + 1}"]`).isVisible(), 'Existing issue routes remain visible.');
    const summary = details.locator('summary');
    assert((await summary.boundingBox()).height >= 44, 'Disclosure targets remain usable.');
    await tabTo(page, summary, `Contribution task ${index + 1}`);
    await verifyKeyboardFocus(summary, `Contribution task ${index + 1}`, false);
    await page.keyboard.press(index % 2 ? 'Space' : 'Enter');
    assert(await details.evaluate(element => element.open));
    assert(await task.locator('.contribute-criteria-copy').isVisible());
    assert(await summary.evaluate(element => element === document.activeElement), 'Disclosure keeps keyboard focus.');
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), 'Expanded task criteria must not overflow.');
    contributionDisclosureChecks++;
  }
  assert.equal(await page.locator('.contribute-criteria[open]').count(), 3, 'Opening a task must not hide other open criteria.');
}

async function verifyDraftDownload(page, context, link, keyboard = false) {
  const downloadURL = new URL('help-and-access-draft.md', origin).href;
  assert.equal(new URL(await link.getAttribute('href'), origin).href, downloadURL);
  const [download] = await Promise.all([page.waitForEvent('download'), keyboard ? page.keyboard.press('Enter') : link.click()]);
  assert.equal(download.suggestedFilename(), 'help-and-access-draft.md');
  assert.equal(await download.failure(), null);
  const bytes = await readFile(await download.path());
  const manifestResponse = await context.request.get(new URL('manifest.json', origin).href, { maxRedirects: 0 });
  assert.equal(manifestResponse.status(), 200);
  const manifest = await manifestResponse.json();
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files['help-and-access-draft.md']);
  assert(bytes.toString('utf8').includes('Not yet specialist-reviewed.'));
  downloadChecks++;
}

async function tabTo(page, target, label) {
  // A bounded real Tab walk catches unreachable controls without clicking any
  // off-site links. Programmatic focus would bypass this part of the journey.
  const limit = await page.locator('a[href], summary').count() + 1;
  for (let step = 0; step < limit; step++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element => element === document.activeElement)) return;
  }
  assert.fail(`${label}: not reachable by Tab`);
}

async function verifyKeyboardFocus(target, label, isDemo = true) {
  const focus = await target.evaluate(element => ({
    active: element === document.activeElement,
    visible: element.matches(':focus-visible'),
    width: parseFloat(getComputedStyle(element).outlineWidth),
    style: getComputedStyle(element).outlineStyle,
  }));
  assert(focus.active && focus.visible && focus.width >= 2 && focus.style !== 'none',
    `${label}: keyboard focus is missing or has no visible outline`);
  if (isDemo) demoKeyboardFocusChecks++;
}

async function verifyDisclosureState(page, session, cardSelector, expanded) {
  assert.equal(await page.locator(`${cardSelector} details`).evaluate(details => details.open), expanded);
  assert.equal(await page.locator(`${cardSelector} .demo-reasoning`).isVisible(), expanded);
  assert.equal(normalizeText(await page.locator(`${cardSelector} summary`).innerText()), 'What can this response show?',
    `${cardSelector}: visible disclosure question must remain concise`);
  const { root } = await session.send('DOM.getDocument');
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: `${cardSelector} summary` });
  const { nodes } = await session.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  const summary = nodes.find(node => !node.ignored && node.properties?.some(property => property.name === 'expanded'));
  assert(summary, `${cardSelector}: native disclosure is missing from the accessibility tree`);
  assert.equal(summary.name?.value, demoSummaryNames[cardSelector],
    `${cardSelector}: accessible name must include the visible question and case context`);
  assert.equal(summary.properties?.find(property => property.name === 'expanded')?.value.value, expanded,
    `${cardSelector}: expanded state is not exposed correctly in the accessibility tree`);
}
try {
  // Block any accidental off-origin request, so a regression cannot transmit data.
  for (const width of [1440, 768, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, javaScriptEnabled: false });
    const blocked = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== url.origin) {
        blocked.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    for (const slug of routes) {
      const requests = [];
      const handler = request => requests.push(new URL(request.url()).pathname);
      page.on('request', handler);
      const response = await page.goto(new URL(`${slug}.html`, origin).href);
      assert.equal(response.status(), 200);
      const metrics = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        h1: document.querySelectorAll('h1').length,
        scripts: document.scripts.length,
        controls: document.querySelectorAll('input,form,iframe').length,
        title: document.title,
      }));
      assert(metrics.scroll <= metrics.viewport + 1, `${slug} overflows at ${width}: ${JSON.stringify(metrics)}`);
      assert.equal(metrics.h1, 1);
      assert.equal(metrics.scripts, 0);
      assert.equal(metrics.controls, 0);
      if (slug === 'contribute') {
        await verifyContributionChoices(page);
        if (artifacts) await page.screenshot({ path: path.join(artifacts, `contribute-expanded-${width}.png`), fullPage: true });
        await page.goto(new URL(`${slug}.html`, origin).href);
      }
      if (slug === 'discussion') {
        assert.equal(await page.locator('#demo').count(), 1, 'Discussion page must retain both guided cases');
        await page.locator('#demo').scrollIntoViewIfNeeded();
        assert(await page.locator('#demo .demo-status').isVisible(), 'Review status must be visible before disclosure');
        assert((await page.locator('#demo .demo-status').innerText()).includes('Not yet specialist-reviewed.'));
        assert.equal(await page.locator('#demo details .demo-status').count(), 0, 'Review status cannot be hidden in a disclosure');
        assert.equal(await page.locator('#demo .demo-card').count(), 2);
        if (artifacts) await page.locator('#demo').screenshot({ path: path.join(artifacts, `demo-collapsed-${width}.png`) });
        const session = await context.newCDPSession(page);
        for (const [index, cardSelector] of demoCards.entries()) {
          assert.equal(await page.locator(`${cardSelector} details`).getAttribute('name'), null,
            'Cases must remain independently openable');
          assert(!(await page.locator(`${cardSelector} .demo-reasoning-print`).isVisible()),
            `${cardSelector}: print copy must not duplicate screen content`);
          await verifyDisclosureState(page, session, cardSelector, false);
          const summary = page.locator(`${cardSelector} summary`);
          await tabTo(page, summary, `${cardSelector}: discussion control`);
          await verifyKeyboardFocus(summary, `${cardSelector} at ${width}`);
          await page.keyboard.press(index === 0 ? 'Enter' : 'Space');
          await verifyDisclosureState(page, session, cardSelector, true);
          await page.keyboard.press(index === 0 ? 'Space' : 'Enter');
          await verifyDisclosureState(page, session, cardSelector, false);
          await summary.click();
          await verifyDisclosureState(page, session, cardSelector, true);
          await summary.click();
          await verifyDisclosureState(page, session, cardSelector, false);
          await summary.click();
          await verifyDisclosureState(page, session, cardSelector, true);
          assert(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)),
            `${cardSelector}: expanded reasoning overflows at ${width}`);
          demoCaseChecks++;
        }
        assert.equal(await page.locator('#demo details[open]').count(), 2, 'Opening one case must not close the other');
        await session.detach();
        const correctionLink = page.locator('#demo a[href="https://github.com/Jstn-1g/open-education-proposal/issues/1"]');
        assert.equal(await correctionLink.count(), 1, 'Demo must lead to the existing correction discussion');
        const sourcesLink = page.locator('#demo a[href$="open-source.html#review-draft"]');
        assert.equal(await sourcesLink.count(), 1, 'Demo must link its source draft and limits');
        assert.equal(new URL(await sourcesLink.getAttribute('href'), origin).href,
          new URL('open-source.html#review-draft', origin).href);
        if (artifacts) await page.locator('#demo').screenshot({ path: path.join(artifacts, `demo-expanded-${width}.png`) });
        await page.keyboard.press('Tab');
        assert(await correctionLink.evaluate(element => element === document.activeElement), 'Correction link must follow the cases in keyboard order');
        const downloadLink = page.locator('#demo a[href$="help-and-access-draft.md"]');
        await page.keyboard.press('Tab');
        assert(await downloadLink.evaluate(element => element === document.activeElement), 'Download must be reachable after the correction link');
        await verifyDraftDownload(page, context, downloadLink, true);
        await page.keyboard.press('Tab');
        assert(await sourcesLink.evaluate(element => element === document.activeElement), 'Source details must be reachable after the download');
        // Reload so the following skip-link and page-level checks start cleanly.
        await page.goto(new URL(`${slug}.html`, origin).href);
      }
      if (slug === 'open-source') {
        const link = page.getByRole('link', { name: 'Download editable draft (.md) →', exact: true });
        await verifyDraftDownload(page, context, link);
        // Restore the initial focus state before checking the skip link.
        await page.goto(new URL(`${slug}.html`, origin).href);
      }
      if (width === 320) {
        const session = await context.newCDPSession(page);
        const { nodes } = await session.send('Accessibility.getFullAXTree');
        const exposed = nodes.filter(node => !node.ignored);
        assert.equal(exposed.filter(node => node.role?.value === 'main').length, 1, `${slug}: main landmark absent or duplicated in accessibility tree`);
        assert.equal(exposed.filter(node => node.role?.value === 'heading' && node.properties?.some(p => p.name === 'level' && p.value.value === 1)).length, 1, `${slug}: main heading not exposed correctly`);
        for (const node of exposed.filter(node => node.role?.value === 'link')) {
          assert(node.name?.value?.trim(), `${slug}: unnamed link in accessibility tree`);
        }
        await session.detach();
        accessibilityTreeChecks++;
      }
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').innerText(), 'Skip to content');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(':focus').getAttribute('id'), 'main');
      if (artifacts && (width === 1440 || width === 320)) {
        await page.screenshot({ path: path.join(artifacts, `${slug}-${width}.png`), fullPage: true });
      }
      reports.push({ slug, width, ...metrics, requests });
      page.off('request', handler);
    }
    assert.equal(blocked.length, 0, `Unexpected outbound requests: ${blocked.join(', ')}`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, forcedColors: 'active', reducedMotion: 'reduce', bypassCSP: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  for (const slug of routes) {
    await page.goto(new URL(`${slug}.html`, origin).href);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert(!overflow, `${slug}: overflow at 200% text and spacing overrides`);
    if (slug === 'contribute') await verifyContributionChoices(page);
    if (slug === 'discussion') {
      for (const cardSelector of demoCards) {
        const summary = page.locator(`${cardSelector} summary`);
        await tabTo(page, summary, `${cardSelector} under forced colors`);
        await verifyKeyboardFocus(summary, `${cardSelector} under forced colors`);
        await page.keyboard.press('Enter');
        assert(await page.locator(`${cardSelector} .demo-reasoning`).isVisible());
      }
      assert.equal(await page.locator('#demo details[open]').count(), 2);
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)),
        'Expanded demo overflows at 200% text and spacing overrides');
    }
  }
  await context.close();
  const printContext = await browser.newContext({ viewport: { width: 794, height: 1123 }, javaScriptEnabled: false });
  await printContext.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
  const printPage = await printContext.newPage();
  await printPage.emulateMedia({ media: 'print' });
  for (const slug of routes) {
    await printPage.goto(new URL(`${slug}.html`, origin).href);
    assert(await printPage.locator('h1').isVisible(), `${slug}: print heading hidden`);
    assert(!(await printPage.locator('nav').isVisible()), `${slug}: print navigation visible`);
    assert(!(await printPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), `${slug}: print overflow`);
    if (slug === 'contribute') {
      for (const task of await printPage.locator('.contribute-task').all()) {
        assert(!(await task.locator('.contribute-criteria').isVisible()), 'Native criteria must not duplicate printed criteria.');
        assert(await task.locator('.contribute-criteria-print').isVisible(), 'Criteria print even when never opened.');
        const text = elements => elements.map(element => element.textContent.trim().replace(/\s+/g, ' '));
        assert.deepEqual(await task.locator('.contribute-criteria-copy li, .contribute-criteria-copy p').evaluateAll(text),
          await task.locator('.contribute-criteria-print li, .contribute-criteria-print p').evaluateAll(text), 'Printed task criteria must match the screen content.');
        contributionPrintChecks++;
      }
      if (artifacts) await printPage.screenshot({ path: path.join(artifacts, 'contribute-print.png'), fullPage: true });
    }
    if (slug === 'discussion') {
      for (const cardSelector of demoCards) {
        assert(!(await printPage.locator(`${cardSelector} details`).isVisible()),
          `${cardSelector}: interactive disclosure must not duplicate printed reasoning`);
        const printReasoning = printPage.locator(`${cardSelector} .demo-reasoning-print`);
        assert(await printReasoning.isVisible(), `${cardSelector}: reasoning must print even if never opened`);
        assert.equal(normalizeText(await printReasoning.textContent()),
          normalizeText(await printPage.locator(`${cardSelector} .demo-reasoning`).textContent()),
          `${cardSelector}: printed reasoning differs from interactive reasoning`);
        demoPrintChecks++;
      }
    }
    // Check the intended keep rules and the block footer used to address the
    // observed flex-fragmentation bug. Actual pagination still needs visual
    // review of Letter and A4 output; computed CSS alone cannot establish it.
    const pagination = await printPage.evaluate(() => ({
      headings: [...document.querySelectorAll('main h1, main h2, main h3, main h4')].map(heading => ({
        text: heading.textContent.trim(),
        after: getComputedStyle(heading).breakAfter,
      })),
      footerInside: getComputedStyle(document.querySelector('.site-footer')).breakInside,
      footerDisplay: getComputedStyle(document.querySelector('.site-footer')).display,
      textLinks: [...document.querySelectorAll('.text-link')].map(link => ({
        minHeight: getComputedStyle(link).minHeight,
        paddingTop: getComputedStyle(link).paddingTop,
        paddingBottom: getComputedStyle(link).paddingBottom,
      })),
    }));
    for (const heading of pagination.headings) {
      assert(['avoid', 'avoid-page'].includes(heading.after), `${slug}: print heading can separate from following content: ${heading.text}`);
    }
    assert(['avoid', 'avoid-page'].includes(pagination.footerInside), `${slug}: print footer can fragment across pages`);
    assert.equal(pagination.footerDisplay, 'block', `${slug}: print footer must retain its reviewed block layout`);
    for (const link of pagination.textLinks) {
      assert.equal(link.minHeight, '0px', `${slug}: print link retains a screen-sized click target`);
      assert.equal(link.paddingTop, '0px', `${slug}: print link retains screen padding`);
      assert.equal(link.paddingBottom, '0px', `${slug}: print link retains screen padding`);
    }
    if (artifacts && slug === 'standard') await printPage.screenshot({ path: path.join(artifacts, 'standard-print.png'), fullPage: true });
  }
  await printContext.close();
  console.log(JSON.stringify({ result: 'PASS', viewportRouteChecks: reports.length, textSpacingForcedColorChecks: routes.length, printMediaChecks: routes.length, accessibilityTreeChecks, downloadChecks, demoCaseChecks, demoPrintChecks, demoKeyboardFocusChecks, contributionDisclosureChecks, contributionPrintChecks, clientJavaScript: false, reports }, null, 2));
} finally {
  await browser.close();
}
