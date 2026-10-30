/* Functional expansion tests, run against the local game server.
 * GAME_URL=http://127.0.0.1:8081 node tests/test_features.cjs
 * PLAYWRIGHT_PATH and CHROME_PATH match the base suite's optional overrides.
 * Browser-only seams are injected in intercepted responses, never shipped.
 */
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/ui');
const url=process.env.GAME_URL||'http://127.0.0.1:8081/';
const source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const seam=`
window.__features={
 snapshot:()=>({state,outfit:{...outfit},environment,totalSnacks,best,environmentBests:{...environmentBests},powers:{...powers},invulnerable,score,snackCount,speed,runTime,dog:{...dog},ground,W,H,obstacles:obstacles.map(o=>({...o})),pickups:pickups.map(p=>({...p})),powerDrops:powerDrops.map(p=>({...p})),nextPower,rings:rings.length,lastPattern}),
 start:startGame,spawn:spawnPattern,jump:queueJump,slide:a=>setSlide('test',a),
 step:s=>{for(let i=0;i<Math.round(s/FIXED_STEP)&&state==='running';i++)update(FIXED_STEP);render();},
 configure:v=>{if(v.obstacles)obstacles=v.obstacles;if(v.pickups)pickups=v.pickups;if(v.dog)Object.assign(dog,v.dog);if(v.runTime!==undefined)runTime=v.runTime;if(v.nextSpawn!==undefined)nextSpawn=v.nextSpawn;if(v.nextPower!==undefined)nextPower=v.nextPower;if(v.powerDrops)powerDrops=v.powerDrops;render();}
};
`;
const injected=source.slice(0,source.lastIndexOf('})();'))+seam+'\n})();';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const passed=[],errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(String(e)));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,r=>r.abort());
  await page.route('**/game.js',r=>r.fulfill({body:injected,contentType:'text/javascript'}));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('#customize-button').click();
  assert(await page.locator('#customizer-screen').isVisible());
  const snap=()=>page.evaluate(()=>__features.snapshot());
  assert.equal((await snap()).state,'customizing');
  await page.keyboard.press('ArrowUp');assert.equal((await snap()).state,'customizing');
  const images=new Set();
  for(const breed of ['corgi','beagle','poodle']){
   await page.locator(`[data-breed="${breed}"]`).click();
   assert.equal((await snap()).outfit.breed,breed);
   assert.equal(await page.locator(`[data-breed="${breed}"]`).getAttribute('aria-pressed'),'true');
   images.add(await page.locator('#dog-preview').evaluate(c=>c.toDataURL()));
  }
  assert.equal(images.size,3);
  for(const color of ['honey','cocoa','snow','slate','ginger']){await page.locator(`[data-color="${color}"]`).click();assert.equal((await snap()).outfit.color,color);}
  for(const accessory of ['none','bandana','bow','crown','glasses']){await page.locator(`[data-accessory="${accessory}"]`).click();assert.equal((await snap()).outfit.accessory,accessory);}
  assert(await page.locator('[data-environment="park"]').isDisabled());assert(await page.locator('[data-environment="beach"]').isDisabled());
  await page.screenshot({path:path.join(out,'customizer-desktop.png'),fullPage:true});
  passed.push('Live preview: three distinct breeds, five fur colors, five accessories; locked destinations cannot be selected');
  await page.keyboard.press('Escape');assert(await page.locator('#customizer-screen').isHidden());
  assert.equal(await page.evaluate(()=>document.activeElement.id),'customize-button');
  await page.reload({waitUntil:'networkidle'});await page.locator('#customize-button').click();
  assert.deepEqual((await snap()).outfit,{breed:'poodle',color:'ginger',accessory:'glasses'});
  await page.locator('#customizer-play').click();assert.equal((await snap()).state,'running');assert(await page.locator('#customizer-screen').isHidden());
  passed.push('Outfit persistence across reload; play with selected pup; Escape and focus restoration');
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
  const config=v=>page.evaluate(v=>__features.configure(v),v),step=s=>page.evaluate(s=>__features.step(s),s);
  const fresh=async()=>{await page.evaluate(()=>__features.start());await config({nextSpawn:1e9,nextPower:1e9});};
  const snack=async(kind='treat')=>{const s=await snap();await config({pickups:[{x:s.dog.x+8,y:s.ground-35,kind,phase:0,extraSpeed:0}]});await step(.025);};
  const power=async(kind)=>{const s=await snap();await config({powerDrops:[{x:s.dog.x,y:s.ground-35,kind}]});await step(.025);};
  await fresh();for(let i=0;i<15;i++)await snack();
  assert.equal((await snap()).totalSnacks,15);assert((await snap()).rings>0);
  // End a real run by colliding; reopen the menu via its production entry point.
  let s=await snap();await config({obstacles:[{x:s.dog.x,type:'fence',w:58,phase:0,extraSpeed:0}]});await step(.02);
  assert.equal((await snap()).state,'over');await page.locator('#change-pup-button').click();
  assert(!(await page.locator('[data-environment="park"]').isDisabled()));
  await page.locator('[data-environment="park"]').click();assert.equal((await snap()).environment,'park');
  await page.locator('#customizer-play').click();await config({nextSpawn:1e9,nextPower:1e9});
  await page.screenshot({path:path.join(out,'park-playing.png'),fullPage:true});
  for(let i=0;i<25;i++)await snack();
  s=await snap();assert.equal(s.totalSnacks,40);assert(s.environmentBests.park>=1875);assert(s.best>=1875);
  await config({obstacles:[{x:s.dog.x,type:'fence',w:58,phase:0,extraSpeed:0}]});await step(.02);
  await page.locator('#change-pup-button').click();assert(!(await page.locator('[data-environment="beach"]').isDisabled()));
  await page.locator('[data-environment="beach"]').click();await page.locator('#customizer-play').click();
  await page.screenshot({path:path.join(out,'boardwalk-playing.png'),fullPage:true});
  await page.reload({waitUntil:'networkidle'});s=await snap();assert.equal(s.totalSnacks,40);assert.equal(s.environment,'beach');assert(s.best>=1875);
  await page.locator('#customize-button').click();assert.equal(await page.locator('[data-environment="beach"]').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(out,'customizer-unlocked.png'),fullPage:true});
  await page.locator('#customizer-play').click();
  passed.push('Actual snack collection unlocks Clover Park at 15 and Sunset Boardwalk at 40; worlds and per-world/all-time best scores survive reload');
  await fresh();await power('magnet');assert((await snap()).powers.magnet>7);
  s=await snap();await config({pickups:[{x:s.dog.x+180,y:s.ground-135,kind:'bone',phase:0,extraSpeed:0}]});await step(.4);assert.equal((await snap()).snackCount,1);
  await step(8);assert.equal((await snap()).powers.magnet,0);
  passed.push('Magnet pickup attracts distant elevated snacks and expires');
  await fresh();await power('double');let before=(await snap()).score;await snack('bone');assert((await snap()).score-before>=50);before=(await snap()).score;await snack();assert((await snap()).score-before>=150);
  await step(11);assert.equal((await snap()).powers.double,0);
  passed.push('Double-point pickup doubles bones, treats and time points; expires');
  await fresh();await power('shield');s=await snap();await config({obstacles:[{x:s.dog.x,type:'fence',w:58,phase:0,extraSpeed:0}]});await step(.03);
  assert.equal((await snap()).state,'running');assert.equal((await snap()).powers.shield,0);assert((await snap()).invulnerable>0);
  await step(1.3);s=await snap();await config({obstacles:[{x:s.dog.x,type:'fence',w:58,phase:0,extraSpeed:0}]});await step(.03);assert.equal((await snap()).state,'over');
  await fresh();await power('shield');s=await snap();await config({dog:{y:s.ground+35,grounded:false,vy:100,coyote:0},obstacles:[{x:s.dog.x-30,type:'pit',w:140,phase:0,extraSpeed:0}]});await step(.03);assert.equal((await snap()).state,'running');assert((await snap()).dog.y<s.ground);await step(1);assert((await snap()).dog.grounded);
  await fresh();await power('shield');await step(13);assert.equal((await snap()).powers.shield,0);
  passed.push('Shield blocks exactly one hit, grants recovery, rescues pits and expires unused');
  await fresh();await power('magnet');await power('shield');await power('double');await page.keyboard.press('p');const timers=(await snap()).powers;await step(4);assert.deepEqual((await snap()).powers,timers);await page.keyboard.press('p');await fresh();assert.deepEqual((await snap()).powers,{magnet:0,double:0,shield:0});
  passed.push('Stacked power timers freeze during pause and reset on restart');
  await fresh();await config({nextPower:.01});await step(.02);assert.equal((await snap()).powerDrops[0].kind,'magnet');
  passed.push('Power-up scheduler emits real in-world pickups');
  // Exercise pattern generation through deterministic RNG and play the generated group.
  for(const [first,second] of [['fence','fence'],['fence','bird'],['pit','rock'],['bird','bird'],['bird','rock']])for(const time of [25,90]) {
   const label=`${first}-${second}`;
   await fresh();await config({runTime:time});await step(.01);
   await page.evaluate(({first,second,time})=>{
    const pool=time>33?['fence','rock','pit','bird','scooter']:['fence','rock','pit','bird'];
    const choice=first==='bird'?(second==='bird'?.1:.9):(second==='bird'?.9:.1);
    const values=[(pool.indexOf(first)+.1)/pool.length,.2,...(first==='bird'?[]:[.9]),.1,choice,.2];
    const original=Math.random;Math.random=()=>values.shift()??.2;
    try{__features.spawn();}finally{Math.random=original;}
   },{first,second,time});
   s=await snap();assert.equal(s.obstacles.length,2,`${label}: expected a group`);
   assert.deepEqual(s.obstacles.map(o=>o.type),[first,second]);
   // React to the nearest obstacle and reset the command once that hazard passes.
   await config({nextSpawn:1e9,nextPower:1e9});
   for(let i=0;i<1000;i++) {
    s=await snap();assert.equal(s.state,'running',`${label} at ${time}s`);
    const o=s.obstacles.find(o=>o.x+o.w>s.dog.x-32);
    if(!o)break;
    const distance=o.x-s.dog.x;
    await page.evaluate(a=>__features.slide(a),o.type==='bird' && distance<210);
    if(o.type!=='bird' && s.dog.grounded && distance<s.speed*.30 && distance>-35) await page.evaluate(()=>__features.jump());
    await step(1/60);
   }
   assert.equal((await snap()).state,'running');
  }
  passed.push('Five generated pattern families clearable at early and maximum speed: fence-fence, fence-bird, pit-rock, bird-bird, bird-rock');
  // Native fullscreen containment, pause-on-resize, explicit exit and rejected API fallback.
  await fresh();await page.locator('#fullscreen-button').click();assert.equal(await page.locator('#fullscreen-button').getAttribute('aria-pressed'),'true');assert.equal((await snap()).state,'paused');
  assert(await page.evaluate(()=>document.fullscreenElement?.id==='game-shell'||document.querySelector('#game-shell').classList.contains('fullscreen-fallback')));
  await page.screenshot({path:path.join(out,'fullscreen.png')});
  await page.locator('#fullscreen-button').click();assert.equal(await page.locator('#fullscreen-button').getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>document.querySelector('#game-shell').requestFullscreen=()=>Promise.reject(Error('Test refusal')));
  await page.locator('#fullscreen-button').click();assert(await page.locator('#game-shell').evaluate(e=>e.classList.contains('fullscreen-fallback')));
  await page.keyboard.press('Escape');assert.equal(await page.locator('#fullscreen-button').getAttribute('aria-pressed'),'false');
  passed.push('Fullscreen enter/exit, safe auto-pause and browser-API rejection fallback');
  const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});phone.on('pageerror',e=>errors.push(String(e)));
  await phone.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,r=>r.abort());
  await phone.route('**/game.js',r=>r.fulfill({body:injected,contentType:'text/javascript'}));
  await phone.goto(url,{waitUntil:'networkidle'});await phone.locator('#customize-button').tap();
  await phone.locator('[data-breed="beagle"]').tap();await phone.locator('[data-accessory="bandana"]').tap();
  assert(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await phone.screenshot({path:path.join(out,'customizer-mobile.png'),fullPage:true});
  await phone.locator('#customizer-play').tap();assert(await phone.locator('#customizer-screen').isHidden());
  await phone.waitForTimeout(350);assert(await phone.locator('#pause-screen').isHidden());assert(await phone.locator('#jump-button').isVisible());
  await phone.locator('#fullscreen-button').tap();assert.equal(await phone.locator('#fullscreen-button').getAttribute('aria-pressed'),'true');
  assert(await phone.locator('#game-shell .touch-controls').count());
  await phone.locator('#resume-button').tap();await phone.waitForTimeout(150);
  assert(await phone.evaluate(()=>{const s=__features.snapshot(),r=document.querySelector('#game').getBoundingClientRect();return Math.abs(r.width/s.W-r.height/s.H)<.001;}));
  await phone.screenshot({path:path.join(out,'fullscreen-mobile.png')});
  await phone.locator('#fullscreen-button').tap();
  passed.push('Mobile live customizer, selected-pup start, contained touch controls and undistorted portrait fullscreen rendering');
  assert.deepEqual(errors,[]);passed.push('No browser JavaScript exceptions');
  fs.writeFileSync(path.join(out,'feature-test-results.json'),JSON.stringify({passed},null,2)+'\n');console.log(JSON.stringify({passed},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
