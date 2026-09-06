// Optional browser review using an existing Playwright installation. No installs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
    if (artifacts && slug === 'standard') await printPage.screenshot({ path: path.join(artifacts, 'standard-print.png'), fullPage: true });
  }
  await printContext.close();
  console.log(JSON.stringify({ result: 'PASS', viewportRouteChecks: reports.length, textSpacingForcedColorChecks: routes.length, printMediaChecks: routes.length, accessibilityTreeChecks, clientJavaScript: false, reports }, null, 2));
} finally {
  await browser.close();
}
