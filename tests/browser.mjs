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
const routes = ['index', 'standard', 'open-source', 'contribute', 'governance', '404'];
const reports = [];
let accessibilityTreeChecks = 0;
let downloadChecks = 0;
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
      if (slug === 'open-source') {
        const link = page.getByRole('link', { name: 'Download editable draft (.md) →', exact: true });
        const downloadURL = new URL('help-and-access-draft.md', origin).href;
        assert.equal(new URL(await link.getAttribute('href'), origin).href, downloadURL);
        const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
        assert.equal(download.suggestedFilename(), 'help-and-access-draft.md');
        assert.equal(await download.failure(), null);
        const bytes = await readFile(await download.path());
        const manifestResponse = await context.request.get(new URL('manifest.json', origin).href, { maxRedirects: 0 });
        assert.equal(manifestResponse.status(), 200);
        const manifest = await manifestResponse.json();
        assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files['help-and-access-draft.md']);
        assert(bytes.toString('utf8').includes('Not yet specialist-reviewed.'));
        downloadChecks++;
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
  console.log(JSON.stringify({ result: 'PASS', viewportRouteChecks: reports.length, textSpacingForcedColorChecks: routes.length, printMediaChecks: routes.length, accessibilityTreeChecks, downloadChecks, clientJavaScript: false, reports }, null, 2));
} finally {
  await browser.close();
}
