// Phaser is a local, optional renderer. It never owns learning state or input.
// Native controls remain usable while it loads, and when graphics are unavailable.
import { period } from './model.mjs';
import { name } from './bridge.mjs';
let library;
function loadLibrary() {
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('Graphics loading timed out.')), 10000);
    script.src = new URL('./vendor/phaser-3.90.0.min.js', import.meta.url).href;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error('Graphics could not load.')); };
    document.head.append(script);
  });
  return library;
}
export async function createWorld(host) {
  if (!document.createElement('canvas').getContext('2d')) throw new Error('Canvas unavailable.');
  await loadLibrary();
  const Phaser = window.Phaser;
  let state = null, scene = null, dirty = true, asleep = 0, disposed = false;
  const assets = new Map();
  const setupKey = s => s ? JSON.stringify(s.mode==='bridge' ? [s.mode,s.blocks,s.selected,s.target,s.matched] : [s.mode,s.length,s.mass,s.hasRun]) : '';
  let game;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Scene loading timed out.')), 10000);
    class LearningScene extends Phaser.Scene {
      create() {
        scene = this;
        this.backdrop = this.add.image(500, 310, '__WHITE').setDisplaySize(1000, 620);
        this.ink = this.add.graphics();
        this.labels = [];
        this.game.canvas.setAttribute('aria-hidden', 'true');
        this.game.canvas.setAttribute('data-renderer', 'phaser-3.90.0');
        clearTimeout(timer); resolve();
      }
      update() { if (dirty && state) { dirty = false; draw(this, state); } }
    }
    try {
      game = new Phaser.Game({type: Phaser.CANVAS, width:1000, height:620, parent:host,
        banner:false, autoFocus:false, backgroundColor:'#d1edf4', audio:{noAudio:true},
        fps:{target:30, limit:30}, input:{keyboard:false, mouse:false, touch:false, gamepad:false},
        scene:LearningScene, render:{antialias:true}, scale:{mode:Phaser.Scale.NONE}});
    } catch (error) { clearTimeout(timer); reject(error); }
  });
  try { await ready; } catch (error) { game?.destroy(true); throw error; }
  function wake() {
    if (disposed) return;
    dirty = true; game.loop.wake(); clearTimeout(asleep);
    asleep = setTimeout(() => { if (!disposed) game.loop.sleep(); }, 120);
  }
  function art(mode) {
    if (assets.has(mode)) return;
    assets.set(mode, 'loading');
    const img = new Image();
    img.onload = () => {
      if (disposed) return;
      scene.textures.addImage(mode, img); assets.set(mode, 'ready'); wake();
    };
    img.onerror = () => { assets.set(mode, 'unavailable'); wake(); };
    // Browser image loading needs img-src only. No XHR, fetch, remote textures, or audio.
    img.src = new URL(mode === 'bridge' ? './art/fraction-canyon.png' : './art/clockwork-room.png', import.meta.url).href;
  }
  function draw(sc, s) {
    const g = sc.ink; g.clear(); sc.labels.forEach(t => t.destroy()); sc.labels=[];
    const text = (x,y,value,size=24,color='#163641',align='center') => {
      const t=sc.add.text(x,y,value,{fontFamily:'Arial, sans-serif',fontSize:`${size}px`,fontStyle:'bold',color,align}).setOrigin(align==='left'?0:.5,.5);
      sc.labels.push(t); return t;
    };
    sc.backdrop.setTexture(assets.get(s.mode)==='ready'?s.mode:'__WHITE');
    sc.backdrop.setDisplaySize(1000,620).setTint(assets.get(s.mode)==='ready'?0xffffff:s.mode==='bridge'?0xd1edf4:0x102741);
    if (s.mode === 'bridge') {
      const start=180, unit=80, y=248, end=start+s.target*unit;
      // Geometry is level and proportional. Artwork has no role in the quantity.
      g.fillStyle(0xf5fbfb,.86).fillRoundedRect(170,360,660,116,14);
      g.lineStyle(2,0x315f64,.6).lineBetween(start,y+85,820,y+85);
      for(let i=0;i<=8;i++) g.lineBetween(start+i*unit,y+78,start+i*unit,y+94);
      let x=start;
      for(const [index,n] of s.blocks.entries()) {
        g.fillStyle(0x063e37,.85).fillRoundedRect(x+1,y+5,n*unit-2,74,4);
        g.fillStyle(index===s.selected?0xf8d169:0x1c8976,1).fillRoundedRect(x+1,y,n*unit-2,66,4);
        g.lineStyle(2,0xb8efdf,.8).strokeRoundedRect(x+2,y+1,n*unit-4,63,4);
        // Eighth ticks allow the mixed pieces to be compared on the same unit.
        for(let j=1;j<n;j++)g.lineStyle(1,0xffffff,.3).lineBetween(x+j*unit,y+10,x+j*unit,y+53);
        text(x+n*unit/2,y+31,name(n),27,index===s.selected?'#17343b':'#ffffff'); x+=n*unit;
      }
      // Target is a mathematical marker, not a floating destination or unsafe jump.
      g.lineStyle(4,0x62410e,1).lineBetween(end,y-85,end,y+86);
      g.fillStyle(0xffce56,1).fillTriangle(end,y-85,end+55,y-65,end,y-45);
      g.fillStyle(0xffffff,.98).fillRoundedRect(end-45,y-135,90,40,8);
      text(end,y-115,s.target===8?'1':name(s.target),25);
      g.lineStyle(6,0x2a565b,1).lineBetween(start,414,820,414);
      const total=s.blocks.reduce((a,b)=>a+b,0);
      g.lineStyle(12,0x0b7c68,1).lineBetween(start,414,start+total*unit,414);
      g.fillStyle(0x093d35,1).fillCircle(start+total*unit,414,10);
      for(let i=0;i<=8;i++)g.lineStyle(2,0x284b51,1).lineBetween(start+i*unit,405,start+i*unit,424);
      text(180,450,'0',22);text(500,450,'1/2',22);text(820,450,'1',22);
      if(s.matched){g.fillStyle(0xffffff,.96).fillRoundedRect(285,490,430,54,14);text(500,517,'Same endpoint. Another way?',25);}
    } else {
      const top=140, pixels=170, colors=[0x71e5e2,0xffcf7c];
      g.fillStyle(0x142c43,.82).fillRoundedRect(160,95,680,370,18);
      g.lineStyle(8,0x8299ad,1).lineBetween(210,top-8,790,top-8);
      [1,s.length].forEach((length,i)=>{
        const cx=i?690:310, color=colors[i], angle=8*Math.PI/180*Math.cos(2*Math.PI*s.time/period(length));
        const bobx=cx+Math.sin(angle)*pixels*length, boby=top+Math.cos(angle)*pixels*length;
        g.lineStyle(1,0x96afc2,.5).lineBetween(cx,top,cx,top+pixels*1.5+30);
        g.lineStyle(3,0xd1e2ee,1).lineBetween(cx,top,bobx,boby);
        g.fillStyle(0x071425,.8).fillCircle(bobx+4,boby+5,(i?s.mass===100?21:s.mass===200?26:32:21));
        g.fillStyle(color,1).fillCircle(bobx,boby,(i?s.mass===100?21:s.mass===200?26:32:21));
        g.fillStyle(0xffffff,.55).fillCircle(bobx-7,boby-8,6);
        g.fillStyle(0xe3f0f7,1).fillCircle(cx,top,7);
        text(bobx,boby,i?'B':'A',22,'#122a3e');
        text(cx,445,s.hasRun?`${period(length).toFixed(2)} s / cycle`:(i?`${length} m`:'1 m'),26,i?'#ffdb9e':'#9cece8');
      });
      // Both traces use the same rolling four-second window and actual model time.
      // Wrapping only x without moving the plotted window would show a false phase.
      const windowStart=Math.floor(s.time/4)*4;
      g.fillStyle(0x0c1d30,.91).fillRoundedRect(160,475,680,124,14);
      [1,s.length].forEach((length,i)=>{
        const cy=505+i*42; g.lineStyle(1,0x607a93,.6).lineBetween(220,cy,790,cy);
        text(188,cy,i?'B':'A',20,i?'#ffdb9e':'#9cece8');
        if(s.hasRun){g.lineStyle(2,colors[i],1).beginPath();
          for(let px=0;px<=570;px+=3){const y=cy-14*Math.cos(2*Math.PI*(windowStart+px/570*4)/period(length));px?g.lineTo(220+px,y):g.moveTo(220,y);}g.strokePath();
          const x=220+(s.time-windowStart)/4*570, y=cy-14*Math.cos(2*Math.PI*s.time/period(length));g.fillStyle(colors[i],1).fillCircle(x,y,5);
        }
      });
      text(220,580,String(windowStart),18,'#d9e7f2');text(790,580,(windowStart+4)+' seconds',18,'#d9e7f2');
    }
    game.canvas.dataset.mode=s.mode;
    game.canvas.dataset.amount=s.mode==='bridge'?s.blocks.reduce((a,b)=>a+b,0):'';
    game.canvas.dataset.setup=setupKey(s);
  }
  return {
    set(next, parent) {
      if(disposed)return;
      if(setupKey(state)!==setupKey(next)) {
        // Never show obsolete pieces, targets, or setups under current native labels.
        // Native controls are already usable while the next frame is prepared.
        game.canvas.style.visibility='hidden';
        game.events.once('postrender',()=>{if(!disposed)game.canvas.style.visibility='visible';});
      }
      state=next;
      if(parent && game.canvas.parentElement!==parent) parent.append(game.canvas);
      art(next.mode);wake();
    },
    pause(){clearTimeout(asleep);game.loop.sleep();},
    destroy(){disposed=true;clearTimeout(asleep);game.loop.wake();game.destroy(true);}
  };
}
