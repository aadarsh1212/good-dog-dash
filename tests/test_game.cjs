/* Headless Chromium regression tests. Test seam exists only in the intercepted response.
 * npm install --no-save playwright; node tests/test_game.cjs
 * Set CHROME_PATH for an existing Chrome and PLAYWRIGHT_PATH for a nonstandard install.
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const server = require('../serve.cjs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts/ui');
fs.mkdirSync(out, { recursive: true });
const seam = `
window.__test = {
 snapshot: () => ({state,score,best,snackCount,speed,runTime,level,travel,dog:{...dog},obstacles:obstacles.map(o=>({...o})),pickups:pickups.map(p=>({...p})),W,H,ground,jumpBuffer,slides:slideSources.size}),
 start:startGame,jump:queueJump,pause,resume,spawn:spawnPattern,
 step: seconds => { for(let i=0;i<Math.round(seconds/FIXED_STEP)&&state==='running';i++) update(FIXED_STEP); render(); },
 configure:v => { if(v.obstacles)obstacles=v.obstacles;if(v.pickups)pickups=v.pickups;if(v.dog)Object.assign(dog,v.dog);if(v.runTime!==undefined)runTime=v.runTime;if(v.score!==undefined)score=v.score;if(v.nextSpawn!==undefined)nextSpawn=v.nextSpawn;render(); },
 slide: active=>setSlide('test',active),hitbox:dogHitbox,hazard:hazardHitbox,render
};
`;
const source = fs.readFileSync(path.join(root,'game.js'),'utf8');
const injected = source.slice(0,source.lastIndexOf('})();')) + seam + '\n})();';
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const passed=[],errors=[];
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
  // External typography must not make offline gameplay tests wait on the network.
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.screenshot({path:path.join(out,'desktop-ready.png'),fullPage:true});
  assert(await page.locator('#start-screen').isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.keyboard.press('Space');assert(await page.locator('#start-screen').isHidden());
  await page.keyboard.press('p');assert(await page.locator('#pause-screen').isVisible());
  const score=await page.locator('#score').innerText();await page.waitForTimeout(200);
  assert.equal(await page.locator('#score').innerText(),score);
  await page.keyboard.press('Escape');assert(await page.locator('#pause-screen').isHidden());
  await page.locator('#sound-button').click();assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'),'true');
  passed.push('Production UI: keyboard start, pause, frozen score, resume, and sound toggle');
  await page.route('**/game.js',route=>route.fulfill({body:injected,contentType:'text/javascript'}));
  await page.reload({waitUntil:'networkidle'});
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
  const snap=()=>page.evaluate(()=>__test.snapshot());
  const configure=v=>page.evaluate(v=>__test.configure(v),v);
  const step=s=>page.evaluate(s=>__test.step(s),s);
  const fresh=()=>page.evaluate(()=>{__test.start();__test.configure({nextSpawn:1e9});});
  await fresh();const ground=(await snap()).ground;
  await page.keyboard.press('ArrowUp');await step(.25);assert((await snap()).dog.y<ground-110);
  await step(.6);assert((await snap()).dog.grounded);assert.equal((await snap()).state,'running');
  passed.push('Jump: responsive input, apex, gravity, and landing');
  await page.keyboard.down('ArrowDown');await step(.1);assert((await snap()).dog.slide>.85);
  await page.keyboard.up('ArrowDown');await step(.15);assert((await snap()).dog.slide<.1);
  passed.push('Hold and release slide');
  for(const time of [0,40,100]) for(const [kind,width] of [['fence',58],['rock',53],['pit',time?140:98],['scooter',84]]) {
   await fresh();await configure({runTime:time});await step(.01);
   const s=await snap(),v=s.speed+(kind==='scooter'?42:0);
   await configure({obstacles:[{x:s.dog.x+v*.28,type:kind,w:width,phase:0,extraSpeed:kind==='scooter'?42:0}]});
   await page.evaluate(()=>__test.jump());await step(1.1);
   assert.equal((await snap()).state,'running',`${kind} jump at ${time}s: ${JSON.stringify(await snap())}`);
  }
  passed.push('Fence, rock, pit and moving scooter clearance at three speeds');
  await fresh();let s=await snap();let bird={x:s.dog.x+90,type:'bird',w:60,phase:0,extraSpeed:55};
  await configure({obstacles:[bird]});await page.evaluate(()=>__test.slide(true));await step(.7);
  assert.equal((await snap()).state,'running');
  await fresh();s=await snap();bird.x=s.dog.x+70;await configure({obstacles:[bird]});await step(.5);
  assert.equal((await snap()).state,'over');
  passed.push('Moving pigeon: standing collision and slide clearance');
  await page.screenshot({path:path.join(out,'desktop-gameover.png'),fullPage:true});
  await fresh();s=await snap();
  await configure({pickups:[{x:s.dog.x+16,y:ground-35,kind:'bone',phase:0,extraSpeed:0}]});await step(.02);
  assert.equal((await snap()).snackCount,1);assert((await snap()).score>=25);
  await configure({pickups:[{x:s.dog.x+16,y:ground-35,kind:'treat',phase:0,extraSpeed:0}]});await step(.02);
  assert.equal((await snap()).snackCount,2);assert((await snap()).score>=100);
  passed.push('Collectible bones +25 and treats +75');
  await configure({score:1234,obstacles:[{x:s.dog.x,type:'fence',w:58,phase:0,extraSpeed:0}]});await step(.02);
  assert.equal((await snap()).state,'over');assert.equal((await snap()).best,1234);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('littlejoy.gooddogdash.v1')).best),1234);
  await fresh();assert.equal((await snap()).score,0);assert.equal((await snap()).snackCount,0);assert.equal((await snap()).best,1234);
  passed.push('Game over, restart reset, and persistent best score');
  await configure({runTime:105});await step(.05);assert.equal((await snap()).speed,570);assert.equal((await snap()).level,6);
  passed.push('Gradual difficulty increase, maximum speed, and six levels');
  // Coyote time and input buffering keep near-edge jumps forgiving.
  await fresh();s=await snap();await configure({obstacles:[{x:s.dog.x-5,type:'pit',w:98,phase:0,extraSpeed:0}]});
  await step(.025);await page.evaluate(()=>__test.jump());await step(.2);assert((await snap()).dog.y<ground-75);
  await fresh();await page.evaluate(()=>__test.jump());await step(.65);await page.evaluate(()=>__test.jump());await step(.2);assert((await snap()).dog.y<ground-50);
  passed.push('Coyote time and buffered landing jumps');
  await fresh();await page.keyboard.down('ArrowDown');await step(.1);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.equal((await snap()).state,'paused');assert.equal((await snap()).slides,0);await page.keyboard.up('ArrowDown');
  passed.push('Focus loss auto-pauses and clears held input');
  await fresh();await configure({score:380,obstacles:[{x:500,type:'fence',w:58,phase:0,extraSpeed:0},{x:960,type:'bird',w:60,phase:0,extraSpeed:55}],pickups:[0,1,2].map(i=>({x:480+i*45,y:ground-(i===1?145:111),kind:i===1?'treat':'bone',phase:i,extraSpeed:0}))});await step(.01);
  await page.screenshot({path:path.join(out,'desktop-playing.png'),fullPage:true});
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(String(e)));
  await phone.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
  await phone.goto(url,{waitUntil:'networkidle'});await phone.screenshot({path:path.join(out,'mobile-ready.png'),fullPage:true});
  assert(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await phone.locator('#jump-button').isHidden());
  await phone.locator('#start-button').tap();assert(await phone.locator('#start-screen').isHidden());assert(await phone.locator('#jump-button').isVisible());await phone.locator('#jump-button').tap();
  await phone.locator('#pause-button').tap();assert(await phone.locator('#pause-screen').isVisible());await phone.locator('#resume-button').tap();assert(await phone.locator('#pause-screen').isHidden());
  passed.push('390 px responsive layout and touch start/jump/pause/resume');
  await phone.waitForTimeout(8500);assert(await phone.locator('#gameover-screen').isVisible());
  await phone.screenshot({path:path.join(out,'mobile-gameover.png'),fullPage:true});
  const offline=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const offpage=await offline.newPage();offpage.on('pageerror',e=>errors.push(String(e)));
  await offpage.route('https://**/*',route=>route.abort());
  await offpage.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('Storage denied');}}));
  await offpage.goto(url,{waitUntil:'networkidle'});await offpage.locator('#start-button').click();assert(await offpage.locator('#start-screen').isHidden());
  passed.push('Reduced motion, blocked external fonts, unavailable local storage');
  const local=await browser.newPage({viewport:{width:1280,height:900}});
  await local.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
  local.on('pageerror',e=>errors.push(String(e)));
  await local.goto(require('node:url').pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'networkidle'});
  await local.locator('#start-button').click();assert(await local.locator('#start-screen').isHidden());
  passed.push('Direct local HTML launch (no server or build required)');
  for(const width of [320,768,1920]) {
   const layout=await browser.newPage({viewport:{width,height:1000}});
   await layout.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
   layout.on('pageerror',e=>errors.push(String(e)));
   await layout.route('**/game.js',route=>route.fulfill({body:injected,contentType:'text/javascript'}));
   await layout.goto(url,{waitUntil:'networkidle'});
   assert(await layout.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}px`);
   await layout.evaluate(()=>{__test.start();const s=__test.snapshot();__test.configure({score:0,obstacles:[{x:s.dog.x,type:'fence',w:58,phase:0,extraSpeed:0}]});__test.step(.02);});
   const shell=await layout.locator('#game-shell').boundingBox(),modal=await layout.locator('.gameover-modal').boundingBox();
   assert(modal.y>=shell.y && modal.y+modal.height<=shell.y+shell.height,`Modal clipping at ${width}px`);
   await layout.close();
  }
  passed.push('320, 768, and 1920 px layouts and unclipped game-over panels');
  assert.deepEqual(errors,[]);passed.push('No browser JavaScript exceptions');
  const result={passed};fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
