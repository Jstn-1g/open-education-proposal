import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||process.env.PLAYWRIGHT_MODULE_PATH).href);
const base=process.argv[2]||'http://127.0.0.1:8773/open-education-proposal/';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Local review only.');
const labBase=base+'learning-lab/';
const out=pathToFileURL(path.resolve(process.argv[3]||'.qa-learning-lab')+path.sep);
await mkdir(out,{recursive:true});
const report={started:new Date().toISOString(),checks:[],sourceHashes:{}};
report.sourceHashes=(await (await fetch(base+'manifest.json')).json()).files;
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
const expanded=':root{font-size:200%!important}*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-block-end:2em!important}';
async function fit(page){
  await page.waitForFunction(()=>{
    const f=document.querySelector('#learning-demo');
    return Math.abs(f.clientHeight-f.contentDocument.querySelector('main').getBoundingClientRect().height-8)<4;
  });
  for(const frame of page.frames()) {
    assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page/iframe overflow');
    assert.deepEqual(await frame.locator('button,select,output').evaluateAll(els=>els.filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.scrollWidth>e.clientWidth+2).map(e=>e.id)),[],'Visible controls must contain their labels');
  }
}
try{
  for(const width of [390,1365]){
    const ctx=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
    await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
    const page=await ctx.newPage();
    for(const fragment of ['', '#demo']){
      await page.goto(base+'index.html'+fragment);
      const demo=page.frameLocator('#learning-demo');
      await demo.locator('body.world-ready,body.simple-view').waitFor();
      await fit(page);
      const position=await page.evaluate(()=>({scroll:scrollY,boundary:document.querySelector('#demo').getBoundingClientRect().top}));
      if(!fragment)assert.equal(position.scroll,0,'A first visit must not skip the introduction or review limits');
      else assert.ok(Math.abs(position.boundary)<2,'The demo link must land at its review boundary, not inside the activity');
    }
    const skipPage=await ctx.newPage();await skipPage.goto(base+'index.html');
    await skipPage.frameLocator('#learning-demo').locator('#loading-note').waitFor({state:'hidden'});
    await skipPage.keyboard.press('Tab');
    assert.equal(await skipPage.evaluate(()=>document.activeElement.className),'skip');
    await skipPage.keyboard.press('Enter');
    assert.equal(await skipPage.evaluate(()=>document.activeElement.id),'demo','Skip link reaches the promised playable section');
    assert.equal(await skipPage.locator('.header-links a').last().getAttribute('href'),new URL(base).pathname+'contribute.html');
    assert.match(await skipPage.frameLocator('#learning-demo').locator('#full-playground').innerText(),/Starts a fresh activity/);
    await ctx.close();report.checks.push({width,firstVisitAndHandoffs:true});
  }
  const motionContext=await browser.newContext({reducedMotion:'no-preference'});
  await motionContext.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  const motionPage=await motionContext.newPage();await motionPage.goto(labBase+'index.html');
  await motionPage.locator('body.world-ready').waitFor();await motionPage.locator('#choose-14').click();
  await motionPage.locator('#run-model').click();assert.equal(await motionPage.locator('#motion-toggle').innerText(),'Pause motion');
  await motionPage.locator('#choose-8').click();await motionPage.locator('#choose-14').click();
  assert.match(await motionPage.locator('#motion-note').innerText(),/^Motion paused/,'Activity switching must not leave a running-status message');
  await motionPage.locator('#run-model').click();await motionPage.locator('#graphics-toggle').click();
  assert.match(await motionPage.locator('#motion-note').innerText(),/^Motion paused/,'Simple view must describe the paused state');
  await motionPage.locator('#mass').selectOption('400');
  assert.match(await motionPage.locator('#motion-note').innerText(),/^Run a comparison first/);
  assert.ok(await motionPage.locator('#lab-results').isHidden());
  await motionContext.close();report.checks.push('Motion status agrees with activity/view transitions and new setups');
  for(const width of [320,390,1365])for(const large of [false,true]){
    const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
    if(large)await ctx.route('**/styles.css',async r=>{const response=await r.fetch();await r.fulfill({response,body:await response.text()+'\n'+expanded});});
    const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'index.html');const demo=page.frameLocator('#learning-demo');
    await demo.locator('#loading-note').waitFor({state:'hidden'});
    assert.ok(await demo.locator('body').evaluate(e=>e.classList.contains('showcase')));
    assert.equal(await demo.locator('.discovery-panel button:visible').count(),5,'Five focused toolkit actions, versus ten in the full playground');
    assert.ok(await demo.locator('[data-add="4"]').isHidden());assert.ok(await demo.locator('#remove-piece').isHidden());assert.ok(await demo.locator('#puzzle').isHidden());
    await demo.locator('#split-piece').click();assert.equal(await demo.locator('#pieces button').count(),2);
    await demo.locator('#check-fraction').click();assert.match(await demo.locator('#fraction-status').textContent(),/ends match/);
    await demo.locator('#fraction-undo').click();assert.equal(await demo.locator('#pieces button').count(),1);
    await demo.locator('#puzzle-help').click();assert.match(await demo.locator('#fraction-status').textContent(),/2 quarters/);
    await demo.locator('#fraction-reset').click();await fit(page);
    await demo.locator('#choose-14').click();assert.ok(await demo.locator('#length').isHidden());
    for(const mass of ['100','200','400']){
      await demo.locator('#mass').selectOption(mass);await demo.locator('#run-model').click();
      assert.equal(await demo.locator('#period-b').textContent(),'2.01 s');
      assert.match(await demo.locator('#lab-conclusion').textContent(),/In this model/);
      assert.equal(await demo.locator('#motion-toggle').textContent(),'Play motion');
    }
    await demo.locator('#motion-step').click();assert.match(await demo.locator('#motion-note').textContent(),/Paused at 0.50 seconds/);
    await fit(page);
    await demo.locator('#graphics-toggle').click();
    assert.equal(await demo.locator('#full-playground').getAttribute('href'),'index.html?view=simple#age14');
    await demo.locator('#full-playground').click();await page.waitForURL('**/index.html?view=simple#age14');
    assert.equal(page.frames().length,1,'Full playground opens outside the iframe');
    assert.ok(await page.locator('#length').isVisible());assert.ok(await page.locator('.prediction-choice').isVisible());
    assert.ok(await page.locator('body').evaluate(e=>e.classList.contains('simple-view')));
    await page.locator('#choose-8').click();assert.equal(await page.locator('.discovery-panel button:visible').count(),10);
    await page.locator('[data-add="2"]').click();assert.equal(await page.locator('#fraction-label').textContent(),'3/4');
    await page.goto(labBase+'index.html#research');assert.ok(await page.locator('#research').getAttribute('open')!==null);
    await page.locator('.brand').click();await page.waitForURL(base+'index.html');
    assert.deepEqual(errors,[]);report.checks.push({width,large,pass:true});await ctx.close();
  }
  const fallback=await browser.newContext({reducedMotion:'reduce'});
  await fallback.route('**/phaser-3.90.0.min.js',r=>r.abort());
  const fp=await fallback.newPage();await fp.goto(base+'index.html');const fd=fp.frameLocator('#learning-demo');
  await fd.locator('body.simple-view').waitFor();await fd.locator('#split-piece').click();
  assert.equal(await fd.locator('#pieces button').count(),2);
  assert.equal(await fd.locator('#full-playground').getAttribute('href'),'index.html?view=simple#age8');
  await fd.locator('#choose-14').click();await fd.locator('#run-model').click();assert.equal(await fd.locator('#period-b').textContent(),'2.01 s');
  await fallback.close();report.checks.push('Focused graphics failure retains both activities and Simple-view handoff');
  const nojs=await browser.newContext({javaScriptEnabled:false});const np=await nojs.newPage();await np.goto(base+'index.html');
  assert.ok(await np.locator('main>section noscript a').first().isVisible());
  await nojs.close();report.checks.push('No-JavaScript direct activity links remain visible');
  report.pass=true;
}catch(error){report.pass=false;report.error=error.stack;throw error;}
finally{report.finished=new Date().toISOString();await writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report));}
