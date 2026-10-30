/* Good Dog Dash: procedural art, 120 Hz physics, forgiving controls.
 * Cosmetic choices never change abilities. Progress saves locally.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  let ctx = canvas.getContext('2d');
  if (!ctx) { $('announcer').textContent = 'This browser does not support Canvas 2D.'; return; }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STORAGE_KEY = 'littlejoy.gooddogdash.v1';
  const FIXED_STEP = 1 / 120;
  const GRAVITY = 2100;
  const JUMP_SPEED = -765;
  let W = 1100, H = 500, ground = 395, pixelRatio = 1, canvasCssWidth = 0, canvasCssHeight = 0;
  let state = 'ready', previousTime = 0, accumulator = 0, sceneTime = 0;
  let runTime = 0, travel = 0, speed = 305, score = 0, snackCount = 0;
  let best = 0, soundEnabled = false, audio = null, level = 1;
  let nextSpawn = 400, jumpBuffer = 0, deathAt = 0, toastTimer = 0;
  let birdIntroduced = false, pitIntroduced = false, milestone = 0;
  let obstacles = [], pickups = [], particles = [], floatingTexts = [];
  let lastPattern = '', lastHud = '';
  const slideSources = new Set();
  const dog = { x: 160, y: ground, vy: 0, grounded: true, coyote: 0.09, slide: 0, blink: 0 };
  const palette = { ink: '#394b3a', cream: '#fff2d7', gold: '#dca369', darkGold: '#bb7c49', green: '#7c9c6a' };
  // Cosmetic choices never change collision geometry or movement abilities.
  const coats = { honey: ['#dca369','#bb7c49','#fff2d7'], cocoa: ['#8b6551','#624939','#ead3b5'], snow: ['#e9e4d9','#aca99e','#fff8ea'], slate: ['#7e8c9c','#556675','#e3e8e7'], ginger: ['#c8754b','#995432','#ffe3be'] };
  const breeds = { corgi: 'Biscuit', beagle: 'Maple', poodle: 'Coco' };
  const environments = {
    maple: { name:'Maple Street', threshold:0, icon:'⌂', description:'Home, sweet neighborhood', sky:'#dcece7', horizon:'#eff0d7', ground:'#ded9c0' },
    park: { name:'Clover Park', threshold:15, icon:'♧', description:'Rolling hills & flower trails', sky:'#cfe9df', horizon:'#e2edc2', ground:'#d1d6b2' },
    beach: { name:'Sunset Boardwalk', threshold:40, icon:'☀', description:'Ocean waves & golden skies', sky:'#f2c7b4', horizon:'#ffe3b4', ground:'#d6b994' }
  };
  let outfit = { breed:'corgi', color:'honey', accessory:'none' }, environment = 'maple';
  let totalSnacks = 0, environmentBests = { maple:0, park:0, beach:0 }, storageAvailable = true;
  let menuReturnState = 'ready', menuOpener = null, lastSavedScore = 0, runStartingBest = best;
  const powers = { magnet:0, double:0, shield:0 };
  const powerInfo = { magnet:{name:'Snack magnet',symbol:'U',color:'#8c79b4',duration:8}, double:{name:'Double points',symbol:'2×',color:'#d8a04f',duration:10}, shield:{name:'Bubble shield',symbol:'◇',color:'#63a6bb',duration:12} };
  let powerDrops = [], nextPower = 6, powerCycle = 0, invulnerable = 0, rings = [], snackPulse = 0, combo = 0, comboTimer = 0, lastPowerHud = '';
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    best = Number.isFinite(stored.best) ? Math.max(0, Math.floor(stored.best)) : 0;
    soundEnabled = stored.sound === true;
    totalSnacks = Number.isFinite(stored.totalSnacks) ? Math.max(0, Math.floor(stored.totalSnacks)) : 0;
    if (stored.outfit && typeof stored.outfit === 'object') {
      if (Object.hasOwn(breeds, stored.outfit.breed)) outfit.breed = stored.outfit.breed;
      if (Object.hasOwn(coats, stored.outfit.color)) outfit.color = stored.outfit.color;
      if (['none','bandana','bow','crown','glasses'].includes(stored.outfit.accessory)) outfit.accessory = stored.outfit.accessory;
    }
    for (const id of Object.keys(environments)) {
      const value = stored.environmentBests?.[id];
      if (Number.isFinite(value)) environmentBests[id] = Math.max(0, Math.floor(value));
    }
    best = Math.max(best, ...Object.values(environmentBests));
    if (Object.hasOwn(environments, stored.environment) && totalSnacks >= environments[stored.environment].threshold) environment = stored.environment;
  } catch (_) { /* Local storage is optional (including private/file browsing). */ }

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const random = (a, b) => a + Math.random() * (b - a);
  const hash = n => { const t = Math.sin(n * 127.1 + 311.7) * 43758.5453; return t - Math.floor(t); };
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function savePreferences() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ best, sound: soundEnabled, outfit, environment, totalSnacks, environmentBests })); }
    catch (_) { storageAvailable = false; }
  }
  function persistProgress() {
    best = Math.max(best, Math.floor(score));
    environmentBests[environment] = Math.max(environmentBests[environment], Math.floor(score));
    lastSavedScore = Math.floor(score); savePreferences();
  }
  function applyOutfit() {
    [palette.gold, palette.darkGold, palette.cream] = coats[outfit.color];
    const label = `${breeds[outfit.breed]} the ${outfit.breed}`;
    $('preview-label').textContent = label;
    $('dog-preview').setAttribute('aria-label', `${label}, ${outfit.color} fur, ${outfit.accessory === 'none' ? 'classic collar' : outfit.accessory}`);
    document.querySelector('.dog-caption span').textContent = `that’s ${breeds[outfit.breed]}!`;
    document.querySelector('#pause-screen .modal p').textContent = `${breeds[outfit.breed]} will be right here.`;
    for (const key of ['breed','color','accessory']) document.querySelectorAll(`[data-${key}]`).forEach(button => button.setAttribute('aria-pressed',String(button.dataset[key] === outfit[key])));
  }
  function updateEnvironmentUI() {
    document.querySelector('.location-tag strong').textContent = environments[environment].name.toUpperCase();
    $('world-motto').textContent = { maple:'☀ EVERY STREET IS AN ADVENTURE', park:'♧ TAKE THE SCENIC ROUTE', beach:'☀ SALTY AIR. HAPPY PAWS.' }[environment];
    $('wardrobe-best').textContent = best.toLocaleString();
    $('lifetime-snacks').textContent = `${totalSnacks} lifetime snacks`;
    $('environment-options').replaceChildren(...Object.entries(environments).map(([id, env]) => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.environment = id;
      const unlocked = totalSnacks >= env.threshold;
      button.disabled = !unlocked; button.setAttribute('aria-pressed', String(environment === id));
      const title = document.createElement('strong'); title.textContent = `${env.icon} ${env.name}`;
      const note = document.createElement('span'); note.textContent = unlocked ? `${env.description} · Best ${environmentBests[id]}` : `Locked · ${totalSnacks} / ${env.threshold} lifetime snacks`;
      button.append(title, note);
      button.addEventListener('click', () => { environment = id; savePreferences(); updateEnvironmentUI(); render(); });
      return button;
    }));
    const locked = Object.values(environments).find(env => totalSnacks < env.threshold);
    $('unlock-progress').textContent = locked ? `Collect ${locked.threshold-totalSnacks} more snacks across any runs to unlock ${locked.name}. No spending required.` : 'Every destination unlocked. The world is your dog park!';
    document.querySelector('.customizer-footer > span').textContent = storageAvailable ? 'Looks and progress save automatically.' : 'Storage unavailable: progress lasts for this visit only.';
  }
  function openCustomizer(event) {
    if (!['ready','over','paused'].includes(state)) return;
    menuReturnState = state; menuOpener = event?.currentTarget || $('customize-button');
    state = 'customizing'; clearInputs();
    $('customizer-screen').hidden = false;
    // Inert background controls prevent focus from escaping the modal.
    for (const id of ['start-screen','gameover-screen','pause-screen']) $(id).inert = true;
    applyOutfit(); updateEnvironmentUI(); $('close-customizer').focus({preventScroll:true});
  }
  function closeCustomizer() {
    if (state !== 'customizing') return;
    state = menuReturnState; $('customizer-screen').hidden = true;
    for (const id of ['start-screen','gameover-screen','pause-screen']) $(id).inert = false;
    menuOpener?.focus({preventScroll:true});
  }
  function renderDogPreview() {
    const original = ctx; ctx = $('dog-preview').getContext('2d');
    if (!ctx) { ctx = original; return; }
    ctx.clearRect(0,0,560,320);
    const env = environments[environment];
    rr(0,0,560,320,24,env.sky); ellipse(440,65,33,33,'#fff0bf');
    ellipse(280,326,340,150,env.horizon); ellipse(272,252,121,13,'#71886b22');
    drawDog(275,248,2.35,true); ctx = original;
  }
  async function toggleFullscreen() {
    const shell = $('game-shell');
    if (state === 'running') pause();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.classList.contains('fullscreen-fallback')) shell.classList.remove('fullscreen-fallback');
      else if (shell.requestFullscreen) await shell.requestFullscreen();
      else shell.classList.add('fullscreen-fallback');
    } catch (_) { shell.classList.add('fullscreen-fallback'); }
    syncFullscreen();
  }
  function syncFullscreen() {
    const active = !!document.fullscreenElement || $('game-shell').classList.contains('fullscreen-fallback');
    document.body.classList.toggle('game-expanded', active);
    $('fullscreen-button').setAttribute('aria-pressed',String(active));
    $('fullscreen-button').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');
    $('fullscreen-button').querySelector('span').textContent = active?'Exit full screen':'Full screen';
    resize();
  }
  function updateSoundButton() {
    $('sound-label').textContent = soundEnabled ? 'Sound on' : 'Sound off';
    $('sound-button').setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Enable sound');
    $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
    $('sound-icon').textContent = soundEnabled ? '♫' : '♪';
  }
  function unlockAudio() {
    if (!soundEnabled) return;
    try {
      if (!audio) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audio = new AudioContext();
      }
      if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { /* Unsupported or blocked audio is harmless. */ }
  }
  function tone(from, to, duration, type = 'sine', volume = 0.06, delay = 0) {
    if (!soundEnabled || !audio || audio.state !== 'running') return;
    try {
      const now = audio.currentTime + delay;
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(now); oscillator.stop(now + duration + 0.025);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch (_) { /* Keep gameplay independent of the audio device. */ }
  }
  function sound(name) {
    if (name === 'jump') tone(250, 660, 0.16, 'sine', 0.075);
    if (name === 'bone') { tone(740, 980, 0.09, 'sine', 0.055); tone(1100, 1320, 0.13, 'sine', 0.05, 0.07); }
    if (name === 'treat') { [660, 880, 1320].forEach((f, i) => tone(f, f * 1.07, 0.14, 'triangle', 0.05, i * 0.07)); }
    if (name === 'slide') tone(170, 70, 0.15, 'triangle', 0.025);
    if (name === 'lose') { tone(330, 130, 0.21, 'triangle', 0.065); tone(160, 75, 0.25, 'sine', 0.05, 0.14); }
    if (name === 'start') [392, 494, 587, 784].forEach((f, i) => tone(f, f, 0.13, 'sine', 0.04, i * 0.075));
    if (name === 'level') { tone(620, 750, 0.12, 'triangle', 0.04); tone(830, 990, 0.15, 'triangle', 0.04, 0.09); }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const changed = Math.abs(rect.width-canvasCssWidth)>1 || Math.abs(rect.height-canvasCssHeight)>1;
    canvasCssWidth = rect.width; canvasCssHeight = rect.height;
    const oldGround = ground;
    // Uniform world scaling keeps the dog round, even in portrait fullscreen.
    W = Math.max(620, 500 * rect.width / Math.max(1, rect.height));
    H = W * rect.height / Math.max(1, rect.width);
    ground = H * 0.79;
    dog.x = Math.max(108, Math.min(170, W * 0.145));
    dog.y += ground - oldGround;
    for (const items of [pickups,powerDrops,particles,floatingTexts,rings]) for (const item of items) item.y += ground-oldGround;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * pixelRatio);
    canvas.height = Math.round(rect.height * pixelRatio);
    // Avoid an unexpected collision when rotating/resizing a running viewport.
    if (state === 'running' && changed) pause();
    render();
  }
  function syncHud(force = false) {
    const current = `${Math.floor(score)}|${best}|${snackCount}|${Math.floor(travel / 18)}`;
    if (!force && lastHud === current) return;
    lastHud = current;
    $('score').textContent = String(Math.floor(score)).padStart(5, '0');
    $('best').textContent = String(best).padStart(5, '0');
    $('bones').textContent = String(snackCount);
    $('distance').textContent = `${Math.floor(travel / 18)} m explored`;
  }
  function toast(message, duration = 2.7) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    toastTimer = duration;
  }
  function resetGame() {
    runStartingBest = best; lastSavedScore = 0;
    for (const key of Object.keys(powers)) powers[key] = 0;
    powerDrops = []; nextPower = 6; powerCycle = 0; invulnerable = 0; rings = []; snackPulse = 0; combo = 0; comboTimer = 0;
    updatePowerHud();
    runTime = 0; travel = 0; speed = 305; score = 0; snackCount = 0; level = 1;
    nextSpawn = W + 70; jumpBuffer = 0; obstacles = []; pickups = [];
    particles = []; floatingTexts = []; slideSources.clear();
    dog.y = ground; dog.vy = 0; dog.grounded = true; dog.coyote = 0.09; dog.slide = 0;
    lastPattern = ''; milestone = 0; birdIntroduced = false; pitIntroduced = false;
    accumulator = 0;
    $('pace-label').textContent = 'Easy paws · Level 1';
    $('slide-button').classList.remove('active');
    $('toast').classList.remove('visible'); toastTimer = 0;
    syncHud(true);
  }
  function startGame() {
    if (state === 'customizing') closeCustomizer();
    // Resolve the menu's responsive size before running; its ResizeObserver echo
    // must not immediately pause the newly started game on a phone.
    resize();
    unlockAudio(); resetGame(); state = 'running';
    updateEnvironmentUI();
    $('start-screen').hidden = true; $('gameover-screen').hidden = true; $('pause-screen').hidden = true;
    $('pause-button').disabled = false; $('pause-button').textContent = 'Ⅱ';
    $('pause-button').setAttribute('aria-label', 'Pause game');
    canvas.focus({ preventScroll: true });
    sound('start'); toast(`Let’s go, ${breeds[outfit.breed]}!  Space / ↑ to jump`, 3);
    $('announcer').textContent = 'Run started. Jump over obstacles and hold Down to slide under pigeons.';
    render();
  }
  function clearInputs() { slideSources.clear(); jumpBuffer = 0; $('slide-button').classList.remove('active'); }
  function pause() {
    if (state !== 'running') return;
    persistProgress();
    state = 'paused'; clearInputs(); $('pause-screen').hidden = false;
    $('pause-button').textContent = '▶'; $('pause-button').setAttribute('aria-label', 'Resume game');
    $('resume-button').focus({ preventScroll: true });
  }
  function resume() {
    if (state !== 'paused') return;
    unlockAudio(); state = 'running'; accumulator = 0;
    $('pause-screen').hidden = true; $('pause-button').textContent = 'Ⅱ';
    $('pause-button').setAttribute('aria-label', 'Pause game'); canvas.focus({ preventScroll: true });
  }
  function gameOver(reason) {
    if (state !== 'running') return;
    state = 'over'; deathAt = performance.now(); clearInputs(); sound('lose');
    const finalScore = Math.floor(score), newRecord = finalScore > runStartingBest;
    persistProgress(); syncHud(true); updateEnvironmentUI();
    $('gameover-screen').hidden = false; $('pause-button').disabled = true;
    $('toast').classList.remove('visible');
    $('final-score').textContent = finalScore.toLocaleString();
    $('final-best').textContent = best.toLocaleString();
    $('final-snacks').textContent = String(snackCount);
    $('result-eyebrow').textContent = newRecord ? 'A NEW PERSONAL BEST!' : 'ONE VERY GOOD RUN';
    $('result-title').innerHTML = newRecord ? 'Best. Dog. Ever.' : 'A little woof.<br>A big adventure.';
    const messages = { pit: 'Mind the gap! Give those little paws a running jump.', bird: 'Low-flying neighbors! Hold ↓ to scoot underneath.', fence: 'Whoops, a fence! A well-timed jump does the trick.', rock: 'Rocky road! Hop a little earlier next time.', scooter: 'Special delivery! Jump over that runaway scooter.' };
    $('result-message').textContent = messages[reason] || 'Even the best pups need a pit stop.';
    $('announcer').textContent = `Run over. Score ${finalScore}. ${snackCount} snacks collected.${newRecord ? ' New personal best!' : ''}`;
    $('restart-button').focus({ preventScroll: true });
  }
  function queueJump() {
    unlockAudio();
    if (state === 'ready') { startGame(); return; }
    if (state === 'over') { if (performance.now() - deathAt > 450) startGame(); return; }
    if (state !== 'running') return;
    jumpBuffer = 0.15;
  }
  function setSlide(source, active) {
    if (active && state === 'running') {
      if (slideSources.size === 0 && dog.grounded) sound('slide');
      slideSources.add(source);
    } else slideSources.delete(source);
    $('slide-button').classList.toggle('active', slideSources.size > 0);
  }

  // A jump lasts 0.73s. Mixed groups leave 1.12s between leading edges,
  // followed by >=1.9s recovery. Moving hazards cannot catch the previous group:
  // a new group waits until the previous trailing edge has passed the player.
  function spawnPattern() {
    if (obstacles.some(o => o.x + o.w > dog.x - 80)) { nextSpawn = speed * 0.25; return; }
    const x = W + 100;
    let pool = ['fence', 'rock'];
    if (runTime > 9) pool.push('pit');
    if (runTime > 17) pool.push('bird');
    if (runTime > 33) pool.push('scooter');
    let type = pool[Math.floor(Math.random() * pool.length)];
    if (type === lastPattern) type = pool[(pool.indexOf(type) + 1) % pool.length];
    if (!obstacles.length && runTime < 5) type = 'fence';
    lastPattern = type;
    const widths = { fence: 58, rock: 53, pit: clamp(98 + runTime * 0.4, 98, 140), bird: 60, scooter: 84 };
    const extraSpeed = type === 'bird' ? 55 : type === 'scooter' ? 42 : 0;
    obstacles.push({ x, type, w: widths[type], phase: random(0, 6), extraSpeed, passed: false });
    if (type === 'bird' && !birdIntroduced) { birdIntroduced = true; toast('Pigeon crossing! Hold ↓ to slide', 3.5); }
    if (type === 'pit' && !pitIntroduced) { pitIntroduced = true; toast('Mind the gap! Jump over street works', 3.3); }
    if (type === 'bird') {
      for (let i = 0; i < 3; i++) pickups.push({ x: x - 42 + i * 40, y: ground - 17, kind: 'bone', phase: i, extraSpeed });
    } else {
      // Three snacks follow a reachable jump arc; a treat marks the apex sometimes.
      for (let i = 0; i < 3; i++) pickups.push({ x: x - 26 + i * (type === 'pit' ? 60 : 45), y: ground - (i === 1 ? 145 : 111), kind: i === 1 && Math.random() > 0.48 ? 'treat' : 'bone', phase: i, extraSpeed });
    }
    let tail = widths[type];
    if (runTime > 22 && Math.random() < 0.65) {
      const choices = type === 'bird' ? ['bird','rock'] : type === 'pit' ? ['rock'] : ['fence','bird'];
      const second = choices[Math.floor(Math.random()*choices.length)];
      const spacing = second === 'bird' && type === 'bird' ? 100 : speed * 1.12 + widths[type];
      // Fixed group-relative velocity guarantees the planned recovery interval.
      obstacles[obstacles.length-1].extraSpeed = 0;
      for (const p of pickups.slice(-3)) p.extraSpeed = 0;
      obstacles.push({x:x+spacing,type:second,w:widths[second],phase:0,extraSpeed:0});
      tail = spacing + widths[second];
      for (let i=0;i<3;i++) pickups.push({x:x+spacing-20+i*40,y:ground-(second==='bird'?17:(i===1?145:111)),kind:i===1?'treat':'bone',phase:i,extraSpeed:0});
      lastPattern = `${type}-${second}`;
    }
    // A safe ground-level snack trail between groups makes unlocks approachable.
    for (let i=0;i<4;i++) pickups.push({x:x+tail+speed*.6+i*35,y:ground-34,kind:i===3?'treat':'bone',phase:i,extraSpeed:0});
    nextSpawn = tail + speed * random(1.9,2.4);
  }
  function updatePowerHud() {
    const value = Object.entries(powers).filter(([,t])=>t>0).map(([key,t])=>`${powerInfo[key].symbol} ${powerInfo[key].name} ${Math.ceil(t)}s`).join(' · ');
    if (value !== lastPowerHud) { $('power-hud').textContent = value; lastPowerHud = value; }
  }
  function activatePower(kind) {
    powers[kind] = powerInfo[kind].duration;
    toast(`${powerInfo[kind].name}! ${kind==='shield'?'Blocks one hit or rescues a fall':kind==='magnet'?'Nearby snacks fly to you':'All points count double'}`,3);
    sound('treat'); rings.push({x:dog.x,y:dog.y-35,life:.7,maxLife:.7,color:powerInfo[kind].color}); updatePowerHud();
  }
  function absorbHit(reason, obstacle) {
    if (powers.shield <= 0 && invulnerable <= 0) return false;
    if (invulnerable <= 0) {
      powers.shield = 0; invulnerable = 1.2;
      emit(dog.x,dog.y-35,'#80c7dd',18); sound('level'); toast('Bubble saved the day!',1.8);
      rings.push({x:dog.x,y:dog.y-35,life:.7,maxLife:.7,color:'#63a6bb'});
    }
    if (obstacle) obstacle.x = -1000;
    if (reason === 'pit') {
      // Bounce out of the pit, including its complete remaining motion envelope.
      obstacles = obstacles.filter(o=>o.type!=='pit'||o.x>dog.x+180||o.x+o.w<dog.x-80);
      dog.y = ground-8; dog.vy = -500; dog.grounded = false;
    }
    updatePowerHud(); return true;
  }
  function dogHitbox() {
    const sliding = dog.slide > 0.48 && dog.grounded;
    return { x: dog.x - (sliding ? 28 : 24), y: dog.y - (sliding ? 28 : 64), w: sliding ? 70 : 61, h: sliding ? 23 : 58 };
  }
  function hazardHitbox(o) {
    if (o.type === 'fence') return { x: o.x + 7, y: ground - 65, w: o.w - 14, h: 64 };
    if (o.type === 'rock') return { x: o.x + 7, y: ground - 38, w: o.w - 13, h: 37 };
    if (o.type === 'scooter') return { x: o.x + 8, y: ground - 58, w: o.w - 15, h: 57 };
    if (o.type === 'bird') return { x: o.x + 4, y: ground - 85 + Math.sin(sceneTime * 5 + o.phase) * 5, w: o.w - 8, h: 38 };
    return null;
  }
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function emit(x, y, color, amount = 7, isDust = false) {
    if (reducedMotion && isDust) return;
    for (let i = 0; i < amount; i++) particles.push({ x, y, vx: random(-110, 90), vy: random(-130, -25), life: random(0.3, 0.6), maxLife: 0.6, size: random(2, 5), color, dust: isDust });
  }
  function update(dt) {
    runTime += dt; sceneTime += dt;
    for (const key of Object.keys(powers)) powers[key] = Math.max(0,powers[key]-dt);
    invulnerable = Math.max(0,invulnerable-dt); comboTimer = Math.max(0,comboTimer-dt); if (!comboTimer) combo=0;
    snackPulse = Math.max(0,snackPulse-dt); updatePowerHud();
    speed = Math.min(570, 305 + runTime * 3.15);
    const movement = speed * dt;
    travel += movement; score += dt * 10 * (powers.double>0?2:1);
    if (Math.floor(score)-lastSavedScore>=10) persistProgress();
    const nextLevel = Math.min(6, 1 + Math.floor(runTime / 20));
    if (nextLevel !== level) {
      level = nextLevel;
      const pace = ['Easy paws', 'Finding a rhythm', 'Happy zoomies', 'Flying paws', 'Neighborhood legend', 'Maximum good dog'];
      $('pace-label').textContent = `${pace[level - 1]} · Level ${level}`;
      toast(`${pace[level - 1]}!  Level ${level}`); sound('level');
    }
    if (Math.floor(score / 1000) > milestone) { milestone = Math.floor(score / 1000); toast(`${milestone * 1000} points! Who’s a good dog?`); }
    nextSpawn -= movement;
    if (nextSpawn <= 0) spawnPattern();
    for (const o of obstacles) o.x -= movement + o.extraSpeed * dt;
    for (const p of pickups) p.x -= movement + p.extraSpeed * dt;
    obstacles = obstacles.filter(o => o.x + o.w > -100);
    pickups = pickups.filter(p => p.x > -40 && !p.collected);
    nextPower -= dt;
    if (nextPower <= 0) {
      const kind = ['magnet','shield','double'][powerCycle++ % 3];
      powerDrops.push({x:W+65,y:ground-35,kind}); nextPower = 14;
    }
    for (const p of powerDrops) {
      p.x -= movement;
      if (Math.hypot(p.x-dog.x,p.y-(dog.y-30))<49) { activatePower(p.kind); p.collected = true; }
    }
    powerDrops = powerDrops.filter(p=>p.x>-50&&!p.collected);

    const onPit = obstacles.some(o => o.type === 'pit' && dog.x + 8 > o.x + 9 && dog.x + 8 < o.x + o.w - 9);
    if (dog.grounded && onPit) dog.grounded = false;
    dog.coyote = dog.grounded ? 0.09 : Math.max(0, dog.coyote - dt);
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    if (jumpBuffer > 0 && (dog.grounded || dog.coyote > 0)) {
      dog.vy = JUMP_SPEED; dog.grounded = false; dog.coyote = 0; jumpBuffer = 0; dog.slide = 0;
      emit(dog.x - 12, ground - 5, '#f1e6c8', 6, true); sound('jump');
    }
    const wantsSlide = slideSources.size > 0 && dog.grounded;
    dog.slide = lerp(dog.slide, wantsSlide ? 1 : 0, Math.min(1, dt * 28));
    if (!dog.grounded) {
      const oldY = dog.y;
      dog.vy += GRAVITY * dt; dog.y += dog.vy * dt;
      if (dog.y >= ground && !onPit && dog.vy >= 0 && oldY <= ground + 5) {
        dog.y = ground; dog.vy = 0; dog.grounded = true;
        emit(dog.x, ground - 3, '#e7ddc2', 5, true);
      }
      if (dog.y > ground + 34) { if (!absorbHit('pit')) { gameOver('pit'); return; } }
    }
    if (dog.grounded && Math.random() < dt * 12) emit(dog.x - 30, ground - 3, '#e8ddc1', 1, true);
    const hit = dogHitbox();
    for (const o of obstacles) {
      const bounds = hazardHitbox(o);
      if (bounds && overlaps(hit, bounds) && !absorbHit(o.type,o)) { emit(dog.x + 25, dog.y - 40, '#f7c879', 13); gameOver(o.type); return; }
    }
    for (const p of pickups) {
      if (p.collected) continue;
      if (powers.magnet>0 && Math.hypot(p.x-dog.x,p.y-(dog.y-35))<240) {
        p.x = lerp(p.x,dog.x,Math.min(1,dt*10)); p.y = lerp(p.y,dog.y-35,Math.min(1,dt*10));
      }
      const bounds = { x: p.x - 15, y: p.y - 14, w: 30, h: 28 };
      const reach = { x: hit.x - 9, y: hit.y - 10, w: hit.w + 18, h: hit.h + 20 };
      if (overlaps(reach, bounds)) {
        p.collected = true; const value = (p.kind === 'treat' ? 75 : 25) * (powers.double>0?2:1);
        score += value; snackCount++;
        totalSnacks++; persistProgress(); combo++; comboTimer=2; snackPulse=.35;
        emit(p.x, p.y, p.kind === 'treat' ? '#e6ad60' : '#fff4d5', reducedMotion?4:(p.kind==='treat'?20:9));
        rings.push({x:p.x,y:p.y,life:.55,maxLife:.55,color:p.kind==='treat'?'#e0a352':'#fff3c2'});
        floatingTexts.push({ x: p.x, y: p.y - 15, text: `+${value}${p.kind==='treat'&&combo>1?' · YUM!':''}`, life: 0.85 }); sound(p.kind);
        for (const env of Object.values(environments)) if (env.threshold===totalSnacks) { toast(`${env.name} unlocked! Visit Customize after your run.`,4); sound('level'); }
      }
    }
    updateEffects(dt, movement);
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('visible'); }
    syncHud();
  }
  function updateEffects(dt, movement) {
    for (const ring of rings) { ring.life-=dt; ring.x-=movement*.25; }
    rings = rings.filter(ring=>ring.life>0);
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt - movement * 0.35; p.y += p.vy * dt; p.vy += 280 * dt; }
    particles = particles.filter(p => p.life > 0);
    for (const f of floatingTexts) { f.life -= dt; f.y -= 39 * dt; f.x -= movement * 0.28; }
    floatingTexts = floatingTexts.filter(f => f.life > 0);
  }

  // Drawing helpers intentionally avoid sprites: every visual remains crisp at any DPR.
  function rr(x, y, w, h, r, fill, stroke, line = 1) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
  }
  function ellipse(x, y, rx, ry, fill, rotation = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  function path(points, fill, stroke, width = 1) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    if (fill) { ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function line(x1, y1, x2, y2, color, width = 1) { path([[x1, y1], [x2, y2]], null, color, width); }
  function text(str, x, y, size, color, font = 'sans-serif', align = 'center') { ctx.fillStyle = color; ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.fillText(str, x, y); }
  function cloud(x, y, scale = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = 0.72;
    rr(-38, -9, 92, 20, 10, '#fffcef'); ellipse(-12, -13, 22, 17, '#fffcef'); ellipse(15, -22, 24, 23, '#fffcef'); ellipse(38, -10, 20, 15, '#fffcef'); ctx.restore();
  }
  function drawSky() {
    const env = environments[environment];
    const gradient = ctx.createLinearGradient(0, 0, 0, ground); gradient.addColorStop(0, env.sky); gradient.addColorStop(1, env.horizon);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
    ellipse(W * 0.775, 115, 47, 47, '#f6edc7'); ellipse(W * 0.775, 115, 32, 32, '#faf1cf');
    const offset = travel * 0.07;
    for (let i = -1; i < Math.ceil(W / 270) + 2; i++) cloud(i * 270 - offset % 270 + 35, 84 + hash(i + Math.floor(offset / 270)) * 83, 0.65 + hash(i * 3) * 0.35);
    if (environment !== 'maple') return;
    // Soft, distant city silhouettes.
    for (let i = -1; i < Math.ceil(W / 110) + 2; i++) {
      const ix = i + Math.floor(travel * 0.12 / 110), x = i * 110 - (travel * 0.12) % 110;
      const h = 45 + hash(ix) * 69;
      const base = ground-110;
      rr(x, base - h, 84, h, 4, '#c9d9cc'); path([[x - 5, base - h], [x + 42, base-23 - h], [x + 88, base - h]], '#c9d9cc');
    }
    ctx.fillStyle = '#d6dec2'; ctx.fillRect(0, ground-112, W, 57);
  }
  function windowPane(x, y, w, h, color = '#b7ccc5') {
    rr(x - 3, y - 3, w + 6, h + 6, 3, '#fff2d6'); rr(x, y, w, h, 2, color);
    line(x + w / 2, y, x + w / 2, y + h, '#f8efd9', 3); line(x, y + h * 0.5, x + w, y + h * 0.5, '#f8efd9', 3);
    path([[x + 3, y + 3], [x + w * 0.48, y + 3], [x + 3, y + h * 0.53]], '#dbe5d9');
    rr(x - 5, y + h + 2, w + 10, 4, 1, '#d5b994');
  }
  function house(x, base, index) {
    const variant = ((index % 4) + 4) % 4;
    const width = 149 + hash(index * 5) * 32, height = 114 + hash(index * 3) * 40;
    const y = base - height;
    const walls = ['#eed0ac', '#e6b8a1', '#cfdbc2', '#e4d4b1'];
    const roofs = ['#a6b4a0', '#b0816d', '#869e8b', '#b19981'];
    rr(x, y, width, height, 2, walls[variant]);
    path([[x - 10, y + 2], [x + width / 2, y - 51], [x + width + 10, y + 2]], roofs[variant]);
    path([[x - 10, y + 2], [x + width / 2, y - 51], [x + width + 10, y + 2]], null, '#f0e7cc', 4);
    rr(x + width - 37, y - 45, 16, 25, 1, walls[variant]); rr(x + width - 40, y - 48, 22, 5, 1, roofs[variant]);
    windowPane(x + 20, y + 19, 28, 35); windowPane(x + width - 49, y + 19, 28, 35);
    if (variant === 1) {
      rr(x + 15, y + 75, width - 30, height - 75, 1, '#849e8f');
      rr(x + 27, y + 47, width - 54, 15, 3, '#faf0d9'); text('BLOOM & CO.', x + width / 2, y + 57, 7, '#8a917a', 'sans-serif');
      for (let j = 0; j < 8; j++) { const aw = (width - 14) / 8; ctx.fillStyle = j % 2 ? '#fff0ce' : '#d79177'; ctx.fillRect(x + 7 + j * aw, y + 65, aw, 14); ellipse(x + 7 + j * aw + aw / 2, y + 79, aw / 2, 5, j % 2 ? '#fff0ce' : '#d79177'); }
      line(x + width / 2, y + 85, x + width / 2, base, '#e6ceaa', 4);
      rr(x + 11, base - 14, 24, 17, 3, '#b28c6b'); ellipse(x + 23, base - 19, 19, 12, '#8ca578');
      for (let j = 0; j < 4; j++) ellipse(x + 9 + j * 9, base - 21 - hash(j) * 8, 4, 4, '#f4dbb0');
    } else {
      rr(x + width / 2 - 15, base - 53, 30, 53, 15, variant === 2 ? '#91aaa0' : '#bba283');
      rr(x + width / 2 - 10, base - 47, 20, 20, 7, '#d5e0d1'); ellipse(x + width / 2 + 8, base - 20, 1.6, 1.6, '#f6eac8');
      windowPane(x + 16, base - 48, 27, 30); windowPane(x + width - 44, base - 48, 27, 30);
      rr(x + width / 2 - 22, base - 3, 44, 5, 1, '#d0c5a7');
    }
    for (let j = 0; j < 3; j++) { const px = x + hash(index * 7 + j) * width; line(px, base - 10 - j * 12, px + 9, base - 10 - j * 12, '#c0aa8a44', 2); }
  }
  function tree(x, base, size, variant = 0) {
    ctx.save(); ctx.translate(x, base); ctx.scale(size, size);
    rr(-5, -99, 10, 101, 3, '#aa9b76'); line(0, -54, -24, -85, '#aa9b76', 5); line(0, -67, 23, -98, '#aa9b76', 5);
    const c = variant ? '#a2b681' : '#9ab484';
    ellipse(-25, -111, 37, 39, c); ellipse(15, -127, 40, 48, c); ellipse(40, -104, 27, 33, c); ellipse(-4, -96, 39, 34, c);
    ellipse(-25, -122, 22, 25, variant ? '#b4c592' : '#afc59a'); ellipse(11, -144, 23, 23, variant ? '#b4c592' : '#afc59a');
    for (let j = 0; j < 7; j++) ellipse(-32 + hash(j * 5 + variant) * 68, -140 + hash(j * 11) * 44, 3, 5, '#d0d8aa77', -0.4);
    ctx.restore();
  }
  function drawNeighborhood() {
    if (environment === 'park') { drawPark(); return; }
    if (environment === 'beach') { drawBeach(); return; }
    const step = 227, offset = travel * 0.28;
    for (let i = -1; i < Math.ceil(W / step) + 2; i++) {
      const n = i + Math.floor(offset / step), x = i * step - offset % step;
      house(x, 321, n);
      tree(x + 198, 326, 0.75 + hash(n) * 0.22, n % 2);
    }
    // Low garden wall and hedges form a calm, readable backdrop behind hazards.
    ctx.fillStyle = '#c5d0aa'; ctx.fillRect(0, 320, W, 25);
    for (let i = -1; i < Math.ceil(W / 60) + 2; i++) {
      const x = i * 60 - (travel * 0.46) % 60;
      ellipse(x, 322, 37, 13 + hash(i) * 7, '#aabd91');
      ellipse(x + 20, 328, 25, 10, '#afc297');
    }
    ctx.fillStyle = '#e8dabe'; ctx.fillRect(0, 338, W, 8); ctx.fillStyle = '#d5c7a7'; ctx.fillRect(0, 346, W, 8);
    for (let i = -1; i < Math.ceil(W / 55) + 2; i++) line(i * 55 - (travel * 0.7) % 55, 347, i * 55 - (travel * 0.7) % 55, 353, '#beb79a', 1);
    // Distant lamp posts, flowers and a tiny neighborhood sign.
    const objectStep = 600, objectOffset = travel * 0.52;
    for (let i = -1; i < Math.ceil(W / objectStep) + 1; i++) {
      const x = i * objectStep - objectOffset % objectStep + 490;
      rr(x - 3, 215, 6, 136, 2, '#7f9582'); rr(x - 7, 345, 14, 8, 2, '#7f9582');
      rr(x - 13, 205, 26, 8, 3, '#7f9582'); path([[x - 11, 205], [x - 8, 179], [x + 8, 179], [x + 11, 205]], '#fff1c5', '#7f9582', 3);
      path([[x - 15, 178], [x, 169], [x + 15, 178]], '#7f9582'); ellipse(x, 168, 3, 3, '#7f9582');
    }
  }
  function drawGround() {
    ctx.fillStyle = '#e4dfc7'; ctx.fillRect(0, ground-41, W, 41);
    ctx.fillStyle = '#f5e7ca'; ctx.fillRect(0, ground, W, 8); ctx.fillStyle = '#c8bfa2'; ctx.fillRect(0, ground + 8, W, 4);
    ctx.fillStyle = environments[environment].ground; ctx.fillRect(0, ground + 12, W, H - ground);
    for (let i = -1; i < Math.ceil(W / 99) + 2; i++) {
      const x = i * 99 - travel % 99;
      line(x, ground + 1, x, ground + 8, '#d3c5a7', 1.3);
      line(x + 18, ground-38, x + 4, ground - 1, '#d6d2b6', 1);
      if (environment === 'beach') line(x,ground+13,x,H,'#b3957766',2);
      else rr(x + 20, ground + 53, 37, 4, 2, '#f6eed5');
    }
    const grassOffset = travel * 0.7;
    for (let i = -1; i < Math.ceil(W / 138) + 2; i++) {
      const x = i * 138 - grassOffset % 138;
      line(x, ground-40, x - 4, ground-47, '#a6b48a', 1.7); line(x, ground-40, x + 3, ground-49, '#a6b48a', 1.7); line(x + 3, ground-40, x + 8, ground-45, '#a6b48a', 1.7);
      if (i % 2 === 0) { line(x + 10, ground-40, x + 12, ground-53, '#a6b48a', 1.5); ellipse(x + 12, ground-54, 3, 3, '#f8efd0'); ellipse(x + 12, ground-54, 1, 1, '#d7ba72'); }
    }
  }
  function drawPark() {
    // Distinct scenery, not just a palette swap: hills, lake, trees, flowers, benches.
    for (let i=-1;i<Math.ceil(W/330)+2;i++) {
      const x=i*330-(travel*.12)%330;
      ellipse(x,307,235,105,'#bccd97'); ellipse(x+185,331,215,75,'#abc18d');
    }
    ctx.fillStyle='#c0d5a0';ctx.fillRect(0,310,W,44);
    for (let i=-1;i<Math.ceil(W/470)+2;i++) {
      const x=i*470-(travel*.3)%470;
      ellipse(x+210,329,88,15,'#9ac7bd');ellipse(x+207,325,60,5,'#c4e1cf');
      tree(x+15,340,1.12,1);tree(x+355,339,.83,0);
      rr(x+95,306,64,7,2,'#bb946b');rr(x+95,293,64,8,2,'#bb946b');
      line(x+104,300,x+104,339,'#6f8b6c',4);line(x+151,300,x+151,339,'#6f8b6c',4);
      for(let j=0;j<7;j++){const fx=x+375+j*10;line(fx,347,fx,334,'#8aab78',2);ellipse(fx,331,4,4,j%2?'#f9d77d':'#e5aca3');}
    }
  }
  function drawBeach() {
    ctx.fillStyle='#93c7bf';ctx.fillRect(0,244,W,91);
    for(let i=0;i<5;i++) {
      const y=251+i*17;
      for(let j=-1;j<Math.ceil(W/110)+1;j++) {
        const x=j*110-((travel*.14+sceneTime*8+i*21)%110);
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+25,y+5,x+54,y);ctx.strokeStyle='#d9eadd99';ctx.lineWidth=2;ctx.stroke();
      }
    }
    ctx.fillStyle='#f1d7ab';ctx.fillRect(0,325,W,29);
    for(let i=-1;i<Math.ceil(W/460)+2;i++) {
      const x=i*460-(travel*.29)%460;
      // Sailboat in the middle distance.
      path([[x+195,286],[x+249,286],[x+238,296],[x+205,296]],'#b48f75');
      line(x+220,285,x+220,231,'#b48f75',2);path([[x+216,233],[x+216,282],[x+184,282]],'#fff4d9');path([[x+224,245],[x+247,282],[x+224,282]],'#e8b39a');
      // Palm silhouette and beach umbrella.
      ctx.beginPath();ctx.moveTo(x+20,343);ctx.quadraticCurveTo(x+43,279,x+24,231);ctx.strokeStyle='#b8946d';ctx.lineWidth=9;ctx.stroke();
      for(let k=0;k<5;k++){ctx.save();ctx.translate(x+24,231);ctx.rotate(-2.6+k*.75);ellipse(24,0,36,9,'#87a987',.2);ctx.restore();}
      line(x+345,303,x+345,344,'#b29874',3);
      path([[x+309,308],[x+345,279],[x+381,308]],'#e7a486');path([[x+333,308],[x+345,279],[x+356,308]],'#fff0cc');
    }
    // A boardwalk rail behind the running lane, never a collision object.
    rr(0,330,W,5,1,'#d0b18c');for(let i=-1;i<Math.ceil(W/100)+1;i++)rr(i*100-(travel*.55)%100,329,5,25,1,'#c2a07e');
  }
  function drawBone(x, y, scale = 1, rotation = -0.35) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scale, scale);
    ctx.shadowColor = '#ab936b22'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    rr(-12, -4, 24, 8, 3, '#fff9e8', '#d8c19c', 1.5);
    ellipse(-12, -4, 5, 5, '#fff9e8'); ellipse(-12, 4, 5, 5, '#fff9e8'); ellipse(12, -4, 5, 5, '#fff9e8'); ellipse(12, 4, 5, 5, '#fff9e8');
    ctx.restore();
  }
  function drawTreat(x, y, spin) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(spin) * 0.18);
    ellipse(0, 0, 12, 12, '#bf8c50'); ellipse(0, -1, 11, 11, '#e7b76c');
    ellipse(-4, -4, 1.8, 1.8, '#ae7948'); ellipse(5, -3, 1.7, 1.7, '#ae7948'); ellipse(1, 5, 1.8, 1.8, '#ae7948'); ellipse(-5, 4, 1.2, 1.2, '#f7d58e');
    ctx.restore();
  }
  function drawDog(x, y, scale = 1, idle = false) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    const sliding = idle ? 0 : dog.slide;
    const airborne = !idle && !dog.grounded;
    const t = sceneTime * (idle ? 3.5 : speed / 20);
    const stride = idle ? Math.sin(t) * 1.5 : Math.sin(t) * (airborne ? 2 : 12);
    const bounce = idle ? Math.sin(t) * 1.2 : (airborne ? -2 : Math.abs(Math.sin(t)) * -2);
    ctx.translate(0, bounce);
    // Curled tail, with a cream tip and a cheerful wag.
    ctx.save(); ctx.translate(-34, -33 + sliding * 10); ctx.rotate(Math.sin(t * 1.7) * 0.18 + sliding * 0.28);
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-28, 4, -33, -14, -20, -22); ctx.bezierCurveTo(-28, -6, -7, -11, 6, -2); ctx.closePath(); ctx.fillStyle = palette.gold; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-22, -22); ctx.bezierCurveTo(-34, -15, -32, -4, -24, 1); ctx.lineTo(-19, -8); ctx.closePath(); ctx.fillStyle = palette.cream; ctx.fill(); ctx.restore();
    // Far legs are darker and offset from the near pair.
    if (sliding < 0.7) {
      ctx.save(); ctx.translate(-25, -18); ctx.rotate((stride / 35) * (1 - sliding)); rr(-6, -3, 12, 21, 5, palette.darkGold); rr(-6, 12, 17, 7, 3, palette.cream); ctx.restore();
      ctx.save(); ctx.translate(21, -18); ctx.rotate((-stride / 35) * (1 - sliding)); rr(-6, -3, 12, 21, 5, palette.darkGold); rr(-5, 12, 17, 7, 3, palette.cream); ctx.restore();
    }
    const bodyY = lerp(-35, -17, sliding), bodyRY = lerp(22, 13, sliding);
    ellipse(-5, bodyY, 39 + sliding * 5, bodyRY, palette.gold);
    if (outfit.breed==='beagle') ellipse(-11,bodyY-7,24,bodyRY*.66,palette.darkGold);
    if (outfit.breed==='poodle') {
      for(let i=0;i<7;i++)ellipse(-32+i*9,bodyY-bodyRY+4,8,8,palette.gold);
      ellipse(-36,bodyY+5,13,15,palette.gold);
      for(let i=0;i<4;i++)ellipse(-27+i*11,bodyY-10,3,3,palette.darkGold+'44');
    }
    ellipse(14, bodyY + 4, 19, bodyRY - 3, palette.cream);
    if (sliding < 0.7) {
      ctx.save(); ctx.translate(-29, -17); ctx.rotate(-stride / 32); rr(-6, -5, 13, 21, 5, palette.gold); rr(-6, 10, 19, 8, 4, palette.cream); ctx.restore();
      ctx.save(); ctx.translate(17, -16); ctx.rotate(stride / 32); rr(-6, -4, 13, 21, 5, palette.gold); rr(-5, 10, 19, 8, 4, palette.cream); ctx.restore();
    } else { rr(-33, -7, 25, 8, 4, palette.cream); rr(21, -7, 31, 8, 4, palette.cream); }
    // Collar and brass name tag; head follows the running/slide posture.
    ctx.save(); ctx.translate(21 + sliding * 10, lerp(-48, -20, sliding)); ctx.rotate(airborne ? -0.13 : sliding * 0.10);
    rr(-8, 8, 23, 7, 3, '#759780'); ellipse(10, 18, 4, 5, '#e4bc6e');
    if(outfit.breed==='corgi') {
      path([[-13, -9], [-17, -42], [5, -26]], palette.gold); path([[-10, -18], [-13, -35], [-1, -26]], '#e3b2a0');
      path([[11, -18], [24, -40], [29, -8]], palette.gold); path([[17, -19], [23, -32], [25, -16]], '#e3b2a0');
    }
    ellipse(7, -8, 25, 26, palette.gold);
    if(outfit.breed==='beagle') ellipse(-13,-2,11,24,palette.darkGold,-.22+Math.sin(t)*.07);
    if(outfit.breed==='poodle') {
      for(let i=0;i<5;i++)ellipse(-11+i*8,-28-Math.sin(i*.8)*5,9,9,palette.gold);
      ellipse(-14,-2,11,20,palette.darkGold);ellipse(-15,12,13,13,palette.gold);
    }
    path([[5, -31], [15, -29], [21, -6], [8, 7], [-1, -4]], palette.cream);
    ellipse(17, 5, 22, 13, palette.cream); ellipse(33, 0, 7, 5, '#3c4137', 0.15);
    const blinking = Math.sin(sceneTime * 0.73) > 0.996;
    if (blinking) line(8, -11, 17, -11, '#454838', 2.5); else { ellipse(13, -12, 3.5, 4.5, '#3c4137'); ellipse(14, -13.5, 1.1, 1.3, '#fff9e7'); }
    line(7, -20, 14, -22, '#b88049', 2);
    ellipse(5, 3, 5, 2.6, '#e5af8c');
    ctx.beginPath(); ctx.moveTo(18, 9); ctx.quadraticCurveTo(27, 16, 32, 6); ctx.strokeStyle = '#86654a'; ctx.lineWidth = 1.7; ctx.stroke();
    if (!sliding) { rr(24, 11, 7, 10, 3.5, '#df9c95'); line(27.5, 14, 27.5, 18, '#c78481', 0.7); }
    if(outfit.accessory==='bandana') { path([[-11,11],[18,11],[6,31]],'#d97f69');line(-6,15,12,15,'#f6d1aa',2); }
    if(outfit.accessory==='bow') { path([[4,15],[-9,8],[-9,23]],'#947fa9');path([[4,15],[17,8],[17,23]],'#ac91bf');ellipse(4,15,4,4,'#6e5b82'); }
    if(outfit.accessory==='crown') { path([[-10,-32],[-15,-51],[-2,-42],[5,-55],[13,-42],[25,-50],[20,-31]],'#edc46c','#c7964a',1);ellipse(5,-38,3,3,'#9cae89'); }
    if(outfit.accessory==='glasses') { rr(5,-18,16,11,4,'#485866');rr(24,-17,12,10,4,'#485866');line(20,-14,25,-14,'#35483f',2);line(-4,-19,7,-14,'#35483f',2);line(8,-15,13,-12,'#c2d8ce',2); }
    ctx.restore(); ctx.restore();
  }
  function drawObstacle(o) {
    ctx.save(); ctx.translate(o.x, ground);
    if (o.type === 'fence') {
      ellipse(o.w / 2, 2, o.w * 0.64, 5, '#a29d7c33');
      rr(0, -45, o.w, 9, 1, '#be936b'); rr(0, -19, o.w, 8, 1, '#be936b');
      for (let j = 0; j < 4; j++) {
        const x = j * 15;
        path([[x, 0], [x, -62], [x + 6, -70], [x + 12, -62], [x + 12, 0]], '#d5aa7a', '#b28c64', 1);
        line(x + 3, -58, x + 3, -5, '#e9c399', 2); ellipse(x + 6, -39, 1.5, 1.5, '#9c805e');
      }
    } else if (o.type === 'rock') {
      ellipse(27, 1, 33, 5, '#92937b2b');
      path([[0, -3], [7, -27], [22, -42], [39, -39], [53, -21], [57, -3]], '#9aab9e');
      path([[0, -3], [18, -18], [22, -42], [7, -27]], '#b2bdb0');
      path([[18, -18], [39, -39], [53, -21], [57, -3]], '#879b8c');
      path([[7, -27], [22, -42], [39, -39], [26, -29]], '#c6cabb');
      line(28, -19, 38, -12, '#758b7d', 1.5);
    } else if (o.type === 'pit') {
      // Readable, high-contrast opening across the full running lane, not a painted spot.
      ctx.fillStyle = '#bfae8b'; ctx.fillRect(0, -3, o.w, 19);
      path([[3, 0], [o.w - 3, 0], [o.w - 7, 16], [o.w * 0.7, 21], [12, 18]], '#657566');
      path([[9, 1], [o.w - 7, 1], [o.w - 11, 12], [14, 15]], '#485d50');
      for (let j = 0; j < o.w / 20; j++) path([[j * 20, -3], [j * 20 + 9, -3], [j * 20 + 13, 1], [j * 20 + 4, 1]], '#efcb80');
      // Cones are decorative advance markers, not hidden collision geometry.
      path([[-17, -1], [-11, -22], [-5, -1]], '#d99363'); path([[-14, -12], [-8, -12], [-7, -7], [-15, -7]], '#fff0ce'); rr(-21, -2, 20, 4, 1, '#b98457');
      line(0, 21, o.w, 21, '#c6b99b', 2);
    } else if (o.type === 'bird') {
      ellipse(30, 0, 24, 4, '#89937722');
      const y = -66 + Math.sin(sceneTime * 5 + o.phase) * 5;
      ctx.translate(28, y);
      path([[12, 6], [40, 0], [27, 14]], '#8caaa4'); ellipse(0, 0, 23, 15, '#98b2af');
      const flap = Math.sin(sceneTime * 18 + o.phase);
      ctx.save(); ctx.rotate(flap * 0.6); ellipse(4, -9, 23, 10, '#b0c5bd', -0.5); line(-4, -14, 16, -17, '#8ea9a2', 2); ctx.restore();
      ellipse(-18, -7, 12, 13, '#8da9a5'); ellipse(-21, -10, 2.3, 2.3, '#3e5149'); ellipse(-21.5, -11, 0.7, 0.7, '#faffed');
      path([[-28, -6], [-38, -2], [-27, 1]], '#d9b16f');
      line(-8, 12, -11, 20, '#b9986e', 2); line(0, 13, -3, 21, '#b9986e', 2);
      // Motion dashes make the approaching hazard distinct from the scenery.
      line(48, -5, 60, -5, '#a7b5a055', 2); line(43, 5, 53, 5, '#a7b5a055', 2);
    } else if (o.type === 'scooter') {
      ellipse(42, 2, 45, 5, '#8f957a22');
      for (const x of [13, 69]) { ellipse(x, -9, 10, 10, '#637b6c'); ellipse(x, -9, 5, 5, '#c4d0b5'); line(x - 5 * Math.sin(sceneTime * 16), -9 - 5 * Math.cos(sceneTime * 16), x + 5 * Math.sin(sceneTime * 16), -9 + 5 * Math.cos(sceneTime * 16), '#8fa18c', 2); }
      rr(9, -24, 65, 10, 5, '#c38c77'); line(15, -22, 11, -62, '#a77260', 5); rr(2, -64, 27, 6, 3, '#6e8a77');
      rr(33, -52, 35, 29, 3, '#e4c49b', '#c7a57d'); ctx.fillStyle = '#f4ddad'; ctx.fillRect(46, -51, 8, 27);
      text('♡', 50, -31, 14, '#b78a61');
    }
    ctx.restore();
  }
  function drawEffects() {
    for (const ring of rings) {
      const t=1-ring.life/ring.maxLife;
      ctx.globalAlpha=1-t;ctx.beginPath();ctx.arc(ring.x,ring.y,14+(reducedMotion?0:easeOut(t)*39),0,Math.PI*2);ctx.strokeStyle=ring.color;ctx.lineWidth=3*(1-t)+1;ctx.stroke();
    }
    ctx.globalAlpha=1;
    for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1); ellipse(p.x, p.y, p.size, p.dust ? p.size * 0.65 : p.size, p.color); }
    ctx.globalAlpha = 1;
    for (const f of floatingTexts) { ctx.globalAlpha = clamp(f.life / 0.3, 0, 1); text(f.text, f.x, f.y, 17, '#658057', 'sans-serif'); }
    ctx.globalAlpha = 1;
  }
  function render() {
    if ($('game-shell').dataset.state !== state) $('game-shell').dataset.state = state;
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawSky(); ctx.save(); ctx.translate(0,ground-395); drawNeighborhood(); ctx.restore(); drawGround();
    if (state === 'ready' || state === 'customizing') {
      // A quiet clearing behind the title, with an oversized animated mascot to the right.
      const wash = ctx.createLinearGradient(0, 0, W * 0.65, 0); wash.addColorStop(0, '#eff0d9f5'); wash.addColorStop(0.68, '#eff0d9df'); wash.addColorStop(1, '#eff0d900');
      ctx.fillStyle = wash; ctx.fillRect(0, 88, W * 0.65, ground - 83);
      const x = W * 0.685, s = W < 800 ? 1.28 : 1.63;
      ellipse(x, ground + 2, 67 * s, 7, '#87987824'); drawDog(x, ground - 2, s, true);
      drawBone(x + 108, ground - 94 + Math.sin(sceneTime * 2.5) * 5, 1.1, -0.5);
      if (W > 850) { drawTreat(x + 160, ground - 130, sceneTime); drawObstacle({ x: W - 106, w: 58, type: 'fence' }); }
      // Tiny hand-drawn sparkles around the hero.
      for (const [sx, sy] of [[x - 83, ground - 100], [x + 87, ground - 48]]) { line(sx - 4, sy, sx + 4, sy, '#d6b776', 1.7); line(sx, sy - 5, sx, sy + 5, '#d6b776', 1.7); }
    } else {
      for (const o of obstacles) drawObstacle(o);
      for (const p of pickups) {
        if (p.collected) continue;
        const bob = reducedMotion ? 0 : Math.sin(sceneTime * 4 + p.phase) * 4;
        if (p.kind === 'bone') drawBone(p.x, p.y + bob, 0.88, -0.3 + Math.sin(sceneTime * 2 + p.phase) * 0.13);
        else { ellipse(p.x, p.y + bob, 18, 18, '#f8d89433'); drawTreat(p.x, p.y + bob, sceneTime + p.phase); }
      }
      for (const p of powerDrops) {
        const info=powerInfo[p.kind], y=p.y+(reducedMotion?0:Math.sin(sceneTime*3)*4);
        ellipse(p.x,y,23,23,info.color+'33');ellipse(p.x,y,17,17,info.color);text(info.symbol,p.x,y+5,16,'#fff9ed');
        text(info.name,p.x,y-29,10,'#455f50');
      }
      const shadowSize = clamp(1 - (ground - dog.y) / 220, 0.35, 1);
      ellipse(dog.x + 4, ground + 1, 47 * shadowSize, 4.5 * shadowSize, '#7f8e6f28');
      if(powers.shield>0 || invulnerable>0) { ellipse(dog.x+2,dog.y-38,66,57,'#86cadd22');ctx.beginPath();ctx.ellipse(dog.x+2,dog.y-38,66,57,0,0,Math.PI*2);ctx.strokeStyle='#84c6d6aa';ctx.lineWidth=2;ctx.stroke(); }
      if(powers.magnet>0) { ctx.save();ctx.setLineDash([4,9]);ctx.beginPath();ctx.ellipse(dog.x,dog.y-35,87,67,0,0,Math.PI*2);ctx.strokeStyle='#9c83c388';ctx.lineWidth=2;ctx.stroke();ctx.restore(); }
      drawDog(dog.x, dog.y, 1, false); drawEffects();
    }
    $('bones').style.transform = reducedMotion?'none':`scale(${1+Math.sin(snackPulse/.35*Math.PI)*.32})`;
    if(state==='customizing') renderDogPreview();
  }
  function frame(time) {
    if (!previousTime) previousTime = time;
    const delta = Math.min((time - previousTime) / 1000, 0.05); previousTime = time;
    if (state === 'running') {
      accumulator += delta;
      while (accumulator >= FIXED_STEP && state === 'running') { update(FIXED_STEP); accumulator -= FIXED_STEP; }
    } else if (['ready','customizing'].includes(state) && !reducedMotion) sceneTime += delta;
    render(); requestAnimationFrame(frame);
  }

  document.addEventListener('keydown', e => {
    if (e.code === 'Escape' && $('game-shell').classList.contains('fullscreen-fallback')) { $('game-shell').classList.remove('fullscreen-fallback');syncFullscreen();return; }
    if (state === 'customizing') {
      if(e.code==='Escape'){e.preventDefault();closeCustomizer();return;}
      if(e.code==='Tab') {
        const buttons=[...$('customizer-screen').querySelectorAll('button:not(:disabled)')];
        const first=buttons[0],last=buttons[buttons.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const isJump = ['Space', 'ArrowUp', 'KeyW'].includes(e.code);
    const isSlide = ['ArrowDown', 'KeyS'].includes(e.code);
    const isPause = ['KeyP', 'Escape'].includes(e.code);
    // Space activates focused HTML buttons normally outside gameplay, preserving keyboard UI.
    if (e.code === 'Space' && e.target.tagName === 'BUTTON' && state !== 'running') return;
    if (isJump || isSlide || isPause) e.preventDefault();
    if (e.repeat) return;
    if (isJump) queueJump();
    if (isSlide) setSlide(`key-${e.code}`, true);
    if (isPause) { if (state === 'running') pause(); else if (state === 'paused') resume(); }
    if (e.code === 'KeyM') $('sound-button').click();
  });
  document.addEventListener('keyup', e => {
    if (['ArrowDown', 'KeyS'].includes(e.code)) { setSlide(`key-${e.code}`, false); e.preventDefault(); }
  });
  $('start-button').addEventListener('click', startGame);
  // Entry points stay available before each run, never alter an active run.
  for (const [parent,id,label] of [['start-button','customize-button','Customize pup & world'],['restart-button','change-pup-button','Customize & explore']]) {
    const button=document.createElement('button');button.id=id;button.type='button';button.className='secondary-button';button.textContent=label;
    $(parent).after(button);button.addEventListener('click',openCustomizer);
  }
  for(const key of ['breed','color','accessory']) document.querySelectorAll(`[data-${key}]`).forEach(button=>button.addEventListener('click',()=>{outfit[key]=button.dataset[key];applyOutfit();savePreferences();renderDogPreview();}));
  $('close-customizer').addEventListener('click',closeCustomizer);
  $('customizer-play').addEventListener('click',startGame);
  $('fullscreen-button').addEventListener('click',toggleFullscreen);
  document.addEventListener('fullscreenchange',syncFullscreen);
  // Native fullscreen includes touch controls because they belong to the game shell.
  $('game-shell').append(document.querySelector('.touch-controls'));
  $('restart-button').addEventListener('click', () => { if (performance.now() - deathAt > 450) startGame(); });
  $('resume-button').addEventListener('click', resume);
  $('pause-button').addEventListener('click', () => state === 'paused' ? resume() : pause());
  $('sound-button').addEventListener('click', () => { soundEnabled = !soundEnabled; unlockAudio(); updateSoundButton(); savePreferences(); if (soundEnabled) sound('bone'); });
  $('jump-button').addEventListener('pointerdown', e => { e.preventDefault(); queueJump(); });
  $('slide-button').addEventListener('pointerdown', e => {
    e.preventDefault(); $('slide-button').setPointerCapture(e.pointerId); setSlide(`pointer-${e.pointerId}`, true);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('slide-button').addEventListener(event, e => setSlide(`pointer-${e.pointerId}`, false));
  canvas.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); queueJump(); } });
  window.addEventListener('blur', () => { clearInputs(); if (state === 'running') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'running') pause(); });
  let lastWidth = 0, lastHeight = 0;
  new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    if (Math.abs(width - lastWidth) > 1 || Math.abs(height - lastHeight) > 1) { lastWidth = width; lastHeight = height; resize(); }
  }).observe(canvas);
  window.addEventListener('pagehide',()=>{if(['running','paused'].includes(state))persistProgress();});
  applyOutfit(); updateEnvironmentUI(); updateSoundButton(); syncHud(true); resize(); requestAnimationFrame(frame);
})();
