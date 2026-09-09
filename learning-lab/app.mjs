import { period, compareSetup } from './model.mjs';
import { amount, add, split, name, compare } from './bridge.mjs';
import { createWorld } from './scene.mjs';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const params=new URLSearchParams(location.search);
const embedded=params.get('embed')==='1' && window.parent!==window;
const showcase=embedded && params.get('focus')==='1';
if(embedded){
  document.body.classList.add('embedded');
  new ResizeObserver(()=>{
    window.parent.postMessage({type:'learning-lab-height',height:Math.ceil($('#main').getBoundingClientRect().height)+8},location.origin);
  }).observe($('#main'));
}
if(showcase){
  document.body.classList.add('showcase');
  $('#pendulum-controls>legend').classList.add('sr-only');
}
let blocks = [4], selected = 0, history = [], target = 4, matched = false;
const targets = [4, 6, 2, 8];
let frame = 0, elapsed = 0, lastFrame = null, hasRun = false, running = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const contrast = matchMedia('(forced-colors: active)');
let activeAge = '8', world = null, loadingWorld = false;
let simple = new URLSearchParams(location.search).get('view') === 'simple' || contrast.matches || Boolean(navigator.connection?.saveData);
function announce(text) { $('#fraction-status').textContent = text; }
function remember() { history.push({ blocks:[...blocks], selected }); if(history.length>32) history.shift(); }
function clearMatch() { matched=false; }
function syncWorld(time=elapsed) {
  if(!world || simple || document.hidden)return;
  world.set(activeAge==='8' ? {mode:'bridge',blocks:[...blocks],selected,target,matched} :
    {mode:'clockwork',length:length(),mass:mass(),time,hasRun}, $(activeAge==='8'?'#fraction-scene':'#clockwork-scene'));
}
function renderFraction(rebuild=true, focusPiece=false) {
  const total=amount(blocks);
  $('#fraction-label').textContent=name(total);
  $('#bridge-mission').textContent=total===target?'Make '+name(target)+' another way.':target===8?'Reach the other side.':'Reach the '+name(target)+' flag.';
  $('#split-note').textContent=selected>=0?'Piece '+(selected+1)+' selected · '+name(blocks[selected]):'No piece selected. Add one below.';
  const firstSplit=target===4 && blocks.length===1 && blocks[0]===4 && !history.length && !matched;
  $('#split-piece').classList.toggle('primary',firstSplit);
  $('#check-fraction').classList.toggle('primary',!firstSplit);
  if(rebuild) {
    $('#pieces').replaceChildren(...blocks.map((units,index)=>{
      const button=document.createElement('button');button.type='button';button.dataset.piece=index;
      button.style.gridColumn='span '+units;
      const value=document.createElement('span');value.textContent=name(units);
      const mark=document.createElement('span');mark.className='piece-mark';mark.setAttribute('aria-hidden','true');
      button.append(value,mark);
      button.addEventListener('click',()=>{selected=index;renderFraction(false);announce('Piece '+(index+1)+', '+name(units)+' selected. '+(units===1?'This is the smallest piece.':'You can split it into two equal pieces.'));});
      return button;
    }));
  }
  $$('#pieces button').forEach((button,index)=>{
    button.setAttribute('aria-pressed',String(selected===index));
    button.setAttribute('aria-label','Piece '+(index+1)+', '+name(blocks[index])+' of the whole');
    button.querySelector('.piece-mark').textContent=selected===index?'Selected':'Select';
  });
  $$('[data-add]').forEach(button=>{button.disabled=total+Number(button.dataset.add)>8;});
  $('#split-piece').disabled=selected<0 || blocks[selected]===1;
  $('#remove-piece').disabled=selected<0;
  $('#fraction-undo').disabled=!history.length;
  const x=30+540*total/8;
  $('#amount-dot').setAttribute('cx',x);$('#amount-line').setAttribute('x2',x);
  $('#line-title').textContent=name(total)+' of one whole, at '+total/8+' on a number line from zero to one';
  if(focusPiece) (selected>=0?$('#pieces button[data-piece="'+selected+'"]'):$('[data-add="4"]')).focus();
  syncWorld();
}
$$('[data-add]').forEach(button=>button.addEventListener('click',()=>{
  const units=Number(button.dataset.add), next=add(blocks,units);if(!next)return;
  remember();blocks=next;selected=blocks.length-1;clearMatch();renderFraction();
  announce('Added '+name(units)+'. Bridge reaches '+name(amount(blocks))+'.');
  if(button.disabled) $('#pieces button[data-piece="'+selected+'"]').focus();
}));
$('#split-piece').addEventListener('click',()=>{
  const next=split(blocks,selected);if(!next)return;
  const old=name(blocks[selected]), half=name(blocks[selected]/2), total=name(amount(blocks));
  remember();blocks=next;clearMatch();renderFraction(true,true);
  announce(old+' became '+half+' + '+half+'. The bridge still reaches '+total+'.');
});
$('#remove-piece').addEventListener('click',()=>{
  if(selected<0)return;remember();blocks.splice(selected,1);selected=Math.min(selected,blocks.length-1);
  clearMatch();renderFraction(true,true);announce('Piece removed. Bridge reaches '+name(amount(blocks))+'.');
});
$('#fraction-undo').addEventListener('click',()=>{
  const previous=history.pop();if(!previous)return;
  blocks=previous.blocks;selected=previous.selected;clearMatch();renderFraction(true,!history.length);
  announce('Undone. Bridge reaches '+name(amount(blocks))+'.');
});
$('#fraction-reset').addEventListener('click',()=>{
  blocks=[4];selected=0;history=[];target=4;clearMatch();renderFraction();
  announce('Your half reaches the flag. Try “Split piece”.');
});
$('#puzzle').addEventListener('click',()=>{
  target=targets[(targets.indexOf(target)+1)%targets.length];clearMatch();renderFraction(false);
  announce('New destination: '+name(target)+'. Build to the flag.');
});
$('#check-fraction').addEventListener('click',()=>{
  matched=amount(blocks)===target;announce(compare(blocks,target));renderFraction(false);
});
$('#puzzle-help').addEventListener('click',()=>{
  remember();blocks=Array.from({length:target/2},()=>2);selected=0;clearMatch();renderFraction();
  announce('One way: '+blocks.length+(blocks.length===1?' quarter reaches ':' quarters reach ')+name(target)+'. Try splitting one quarter.');
});
async function enableWorld() {
  if(world){syncWorld();return;}
  if(loadingWorld || simple)return;
  loadingWorld=true;
  try {
    world=await createWorld($(activeAge==='8'?'#fraction-scene':'#clockwork-scene'));
    document.body.classList.add('world-ready');
    if(simple)world.pause();else syncWorld();
    $('#graphics-status').textContent=simple?'Simple view. Same activities and current setup.':'Illustrated view ready. All actions also work with the buttons.';
  } catch {
    simple=true;document.body.classList.add('simple-view');
    updatePlaygroundLink();
    $('#graphics-toggle').setAttribute('aria-pressed','true');
    $('#graphics-status').className='graphics-notice';
    $('#graphics-status').textContent='Illustrated view unavailable. Both activities still work in Simple view.';
  } finally {loadingWorld=false;}
}
function setSimple(value) {
  simple=value;document.body.classList.toggle('simple-view',simple);
  $('#graphics-toggle').setAttribute('aria-pressed',String(simple));
  $('#graphics-status').textContent=simple?'Simple view. Same activities and current setup.':'Illustrated view.';
  updatePlaygroundLink();
  if(simple){stopMotion();world?.pause();}else enableWorld();
}
$('#graphics-toggle').addEventListener('click',()=>setSimple(!simple));
contrast.addEventListener('change',()=>{if(contrast.matches)setSimple(true);});

const length = () => Number($('input[name=length]:checked').value);
const mass = () => Number($('input[name=mass]:checked').value);
function stopMotion() {
  if (running) $('#motion-note').textContent = 'Motion paused. Play or step through at your own pace.';
  cancelAnimationFrame(frame); frame = 0; running = false; lastFrame = null;
  $('#motion-toggle').textContent = 'Play motion';
}
function drawMotion(time = 0) {
  const windowStart=Math.floor(time/4)*4;
  $('#graph-window').hidden=!hasRun;
  const graphLabel='Swing angle: A above, B below · '+windowStart+'–'+(windowStart+4)+' seconds';
  if($('#graph-window').textContent!==graphLabel) $('#graph-window').textContent=graphLabel;
  const angleA = 8 * Math.cos(2 * Math.PI * time / period(1));
  const angleB = 8 * Math.cos(2 * Math.PI * time / period(length()));
  $('#swing-a').setAttribute('transform', `rotate(${angleA} 160 45)`);
  $('#swing-b').setAttribute('transform', `rotate(${angleB} 480 45)`);
  syncWorld(time);
}
function animate(timestamp) {
  if (!running) return;
  if (lastFrame !== null) elapsed += Math.min((timestamp - lastFrame) / 1000, 0.1);
  lastFrame = timestamp; drawMotion(elapsed);
  if (elapsed >= 12) { stopMotion(); $('#motion-note').textContent = 'Motion paused. Replay or change the setup.'; return; }
  frame = requestAnimationFrame(animate);
}
function playMotion() {
  if (!hasRun) return;
  if (elapsed >= 12) elapsed = 0;
  running = true; lastFrame = null; $('#motion-toggle').textContent = 'Pause motion';
  $('#motion-note').textContent = 'Both start together at 8°. Motion pauses after 12 seconds.';
  frame = requestAnimationFrame(animate);
}
function updateSetup() {
  stopMotion(); elapsed = 0; hasRun = false;
  $('#lab-results').hidden = true; $('#motion-toggle').disabled = true; $('#motion-step').disabled = true;
  $('#motion-controls').hidden = true;
  $$('input[name=prediction]').forEach(input => { input.checked = false; });
  $('#setup-label').textContent = `${length()} m · ${mass()} g`;
  const y = 45 + 150 * length();
  $('#string-b').setAttribute('y2', y); $('#bob-b').setAttribute('cy', y); $('#bob-b-letter').setAttribute('y', y + 6);
  // Bob centre, not its edge, defines model length. Size is only a mass cue.
  $('#bob-b').setAttribute('r', mass() === 100 ? 18 : mass() === 200 ? 22 : 27);
  const { changed } = compareSetup(length(), mass());
  $('#test-design').textContent = {
    mass: 'Only mass changes. Both lengths stay the same.',
    length: 'Only length changes. Both masses stay the same.',
    both: 'Length and mass both change. Make one match A to test the other.',
    neither: 'Both setups match. Try changing just length or just mass.',
  }[changed];
  $('#test-design').classList.toggle('warning', changed === 'both');
  $('#motion-note').textContent = 'Run a comparison first. Then play or step through.';
  $('#pendulum-scene-title').textContent = `Ready: A is 1 metre and 100 grams; B is ${length()} metres and ${mass()} grams. No result yet.`;
  drawMotion();
}
$('#length').addEventListener('change', updateSetup); $('#mass').addEventListener('change', updateSetup);
$('#run-model').addEventListener('click', () => {
  stopMotion(); elapsed = 0; hasRun = true;
  const comparison = compareSetup(length(), mass());
  const result = { faster: 'B takes less time per cycle.', same: 'Both take the same time per cycle.', slower: 'B takes more time per cycle.' }[comparison.outcome];
  $('#period-a').textContent = `${period(1).toFixed(2)} s`; $('#period-b').textContent = `${period(length()).toFixed(2)} s`;
  $('#lab-conclusion').textContent = `In this model: ${result}${comparison.changed === 'both' ? ' Length and mass both changed, so this comparison cannot test just one.' : ''}`;
  const prediction = $('input[name=prediction]:checked')?.value;
  $('#prediction-readback').hidden = !prediction;
  $('#prediction-readback').textContent = prediction ? `You predicted: ${ { faster: 'less time', same: 'the same time', slower: 'more time' }[prediction] }. What do you notice?` : '';
  $('#model-explanation').textContent = length() === 1 ? 'The lengths match, so the model calculates the same period even when the masses differ.' : 'The model links a longer pivot-to-bob-centre distance to a longer cycle, and a shorter distance to a shorter cycle. Mass does not change the calculated period.';
  $('#pendulum-scene-title').textContent = `Ideal simulation. A: ${period(1).toFixed(2)} seconds per cycle. B: ${period(length()).toFixed(2)} seconds per cycle.`;
  $('#lab-results').hidden = false; $('#motion-toggle').disabled = false; $('#motion-step').disabled = false;
  $('#motion-controls').hidden = false;
  // The live result announces without pulling the viewport away from the scene.
  drawMotion();
  if (!reduced.matches && !simple) playMotion();
  else $('#motion-note').textContent = 'Motion paused. Play or step through at your own pace.';
});
$('#motion-toggle').addEventListener('click', () => { if (running) { stopMotion(); $('#motion-note').textContent = 'Paused. Results are still available below.'; } else playMotion(); });
$('#motion-step').addEventListener('click', () => {
  if(!hasRun)return;
  stopMotion(); elapsed+=period(1)/4;drawMotion(elapsed);
  $('#motion-note').textContent='Paused at '+elapsed.toFixed(2)+' seconds. A: '+(elapsed/period(1)).toFixed(2)+' cycles; B: '+(elapsed/period(length())).toFixed(2)+' cycles.';
});
$('#lab-reset').addEventListener('click', () => { $('input[name=length][value="1"]').checked = true; $('input[name=mass][value="200"]').checked = true; updateSetup(); });
reduced.addEventListener('change', () => { if (reduced.matches) { stopMotion(); $('#motion-note').textContent = 'Reduced motion: paused. Results remain available.'; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) {stopMotion();world?.pause();} else syncWorld(); });
function chooseAge(age, updateHash = true) {
  const older = age === '14'; activeAge=older?'14':'8';
  $('#age8').hidden = older; $('#age14').hidden = !older;
  $('#choose-8').setAttribute('aria-pressed', String(!older)); $('#choose-14').setAttribute('aria-pressed', String(older));
  stopMotion();
  updatePlaygroundLink();
  syncWorld();
  if (updateHash) window.history.replaceState(null, '', older ? '#age14' : '#age8');
}
function updatePlaygroundLink(){
  $('#full-playground').href='index.html'+(simple?'?view=simple':'')+'#age'+activeAge;
}
$('#choose-8').addEventListener('click', () => chooseAge('8')); $('#choose-14').addEventListener('click', () => chooseAge('14'));
window.addEventListener('hashchange', () => {
  if (location.hash === '#age8' || location.hash === '#age14') chooseAge(location.hash === '#age14' ? '14' : '8', false);
  if (location.hash === '#research') $('#research').open=true;
});
$('.research-link').addEventListener('click', () => { $('#research').open = true; });
renderFraction(); updateSetup();
$('#fraction-controls').disabled = false; $('#pendulum-controls').disabled = false; $('#loading-note').hidden = true;
$('#choose-8').disabled = false; $('#choose-14').disabled = false; $('#graphics-toggle').disabled=false;
setSimple(simple);
chooseAge(location.hash === '#age14' ? '14' : '8', false);
if(location.hash === '#research') $('#research').open=true;
