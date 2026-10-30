# Good Dog Dash

A standalone 2D side-scrolling runner with a customizable cartoon dog. A warm paper-and-sage interface frames three illustrated worlds: a pastel neighborhood, a leafy park, and a sunset boardwalk.

## Play

**[Play the public game](https://good-dog-dash.vercel.app/)** · [GitHub repository](https://github.com/aadarsh1212/good-dog-dash) (private).

The public Vercel deployment is live and browser-tested. The private GitHub repository is connected to Vercel with `main` as the production branch; see [deployment status and setup](DEPLOYMENT.md).

Open [index.html](index.html) in a modern browser. No build, server, account, image downloads, or runtime package installation is required. The optional Google Fonts stylesheet falls back to local sans-serif fonts offline.

The local development server is available at [localhost:8081](http://localhost:8081/). To restart it, run `npm start` (or `node serve.cjs`) from this game's directory with Node installed. The dependency-free [local server](serve.cjs) uses Brotli/gzip compression and disables stale asset caching; compression resolved stalled asset transfers observed with this host's uncompressed development server. It is bound only to this computer, not exposed to the network. Other workspace servers on ports 8000 and 8765 were left untouched. No server is necessary for direct HTML play.

- **Space / Up / W:** start or jump. Jump again just before landing to buffer the next jump.
- **Hold Down / S:** slide; release to stand. Jump takes priority over a held slide.
- **P / Escape:** pause or resume.
- **M or Sound button:** toggle synthesized sound effects. Audio is off initially and starts only after a user gesture.
- **Touch:** use the Jump and hold-to-Slide buttons, or tap the game canvas to jump.
- **Full screen button:** expand the game window; click again to exit. Unsupported or denied native fullscreen uses an in-page viewport-filling fallback (Escape exits it). Touch controls remain inside the fullscreen game. Portrait layouts preserve the dog's proportions rather than stretching the canvas. Entering/exiting during a run pauses safely; use Resume to continue.

Window focus loss, tab hiding, and viewport resizing automatically pause a running game. Restart is available from the game-over panel.

## Customize and unlock

Choose **Customize pup & world** before starting, or **Customize & explore** on the game-over screen. The live preview uses the same dog renderer as gameplay. Choose from 75 combinations:

- **Breeds:** Biscuit the corgi, Maple the beagle, and Coco the poodle. Ears, markings, and coat silhouettes change; movement and hitboxes stay consistent.
- **Fur:** honey, cocoa, snow, slate, or ginger.
- **Accessories:** classic collar, bandana, bow tie, crown, or sunglasses.

Looks save automatically. Select a destination, then **Run with this pup**:

- **Maple Street:** available immediately.
- **Clover Park:** unlock with **15 lifetime snacks**. Rolling hills, lake, benches, flowers, and trees.
- **Sunset Boardwalk:** unlock with **40 lifetime snacks**. Sunset sky, ocean waves, sailboats, umbrellas, palms, and a wooden boardwalk.

Both bones and treats count toward permanent, cumulative unlocks. Nothing is spent. Each world has a saved personal best, alongside the global high score. The previous score-storage key is retained for compatibility. Progress saves on collection, approximately every 10 score points, on pause, game over, and page exit. Browser storage is local to the browser and origin: localhost, 127.0.0.1, and direct file URLs can have separate saves. Clearing site data clears progress. If storage is blocked, play continues for the current visit and the customizer reports when saving fails.

## Power-ups and snack feedback

Glowing power-up pickups begin spawning after six seconds and then every fourteen seconds, cycling through:

- **Snack magnet (8 seconds):** draws nearby bones and treats toward the dog within 240 virtual pixels.
- **Bubble shield (12 seconds or one hit):** blocks one obstacle collision or rescues a fall into a pit; a 1.2-second recovery window prevents an immediate repeat hit.
- **Double points (10 seconds):** doubles both collectible and running-score awards.

Different powers stack. Collecting the same one refreshes its timer. Timers freeze while paused; powers and effects reset between runs. An on-screen timer strip shows active powers. Snack collection adds expanding rings, a particle burst, floating points, a bouncing snack counter, and a YUM label on treat streaks. The streak is visual feedback, not an undisclosed score multiplier.

## Gameplay and design intent

- Jump over picket fences, rocks, street-work pits, and approaching delivery scooters.
- Slide underneath low-flying, animated pigeons.
- Collect bones for **25 points** and treats for **75 points**. The snack counter includes both.
- Earn **10 points per simulated second**, plus collectible bonuses.
- Six difficulty labels unlock in 20-second steps. Scrolling speed rises smoothly from 305 to a capped 570 virtual pixels/second.
- Obstacle types appear gradually. Later runs introduce jump-jump, jump-slide, pit-hop, slide-hop, and extended pigeon groups. Multi-action groups use fixed relative velocities and a 1.12-second-plus-width interval, with longer recovery between groups. A group cannot spawn until the previous trailing hazard has passed the player; moving hazards cannot catch up from behind another group. Safe ground-level snack trails reward completing patterns.
- Local high scores and sound preferences persist when browser storage is available. Failure to access storage does not prevent playing.
- Fixed 120 Hz physics, requestAnimationFrame rendering, 150 ms input buffering, 90 ms coyote time, and deliberately forgiving hitboxes keep controls responsive.
- Corgi running, blinking, tail wagging, airborne poses, sliding, pickup sparkles, dust, and floating score labels are drawn procedurally. Jump, collection, slide, level, start, and game-over sounds use Web Audio synthesis.
- Reduced-motion settings disable decorative idle animation, pickup bobbing, dust, and CSS transitions. Essential scrolling and movement remain part of the game.

## Implementation

- [index.html](index.html): semantic UI, HUD, start/pause/game-over screens, and touch controls.
- [style.css](style.css): responsive layout, typography, and UI styling.
- [game.js](game.js): physics, obstacle patterns, controls, Canvas artwork, audio, storage, and scoring.
- [serve.cjs](serve.cjs): optional compressed localhost server, also exercised by the regression suite.
- [package.json](package.json): optional development-only browser test dependency. It is not required to play.

## Validation

[Browser tests](tests/test_game.cjs) passed in headless Chrome 156 on macOS, including production keyboard/touch controls, collision and clearance at three speeds, collection values, restart and storage, coyote time, buffered jumping, difficulty limits, focus-loss behavior, reduced motion, denied storage, unavailable web fonts, direct local HTML launch, and layouts at 320, 390, 768, 1440, and 1920 pixels wide. No JavaScript exceptions were observed. Chrome validation is not a claim of testing every browser or physical touch device.

[Expansion tests](tests/test_features.cjs) additionally passed for all customization choices, live preview, reload persistence, actual collectible-driven unlocks at both thresholds, per-world scores, each power-up's effect and expiry, shield consumption and pit rescue, timer pause/reset, real pickup scheduling, five generated obstacle-pattern families at early and maximum speed, fullscreen enter/exit and fallback, and mobile customizer-to-game transition. See [feature test results](artifacts/ui/feature-test-results.json).

[Localhost smoke results](artifacts/ui/localhost-test-results.json) separately verify three browser loads of the production JavaScript (no injected game hook), dog customization, starting, and pausing at the actual localhost address. The server delivered each script with HTTP 200 and Brotli encoding. No JavaScript exceptions were observed.

- [Desktop customizer](artifacts/ui/customizer-desktop.png)
- [Mobile customizer](artifacts/ui/customizer-mobile.png)
- [Unlocked destinations](artifacts/ui/customizer-unlocked.png)
- [Sunset Boardwalk gameplay](artifacts/ui/boardwalk-playing.png)
- [Clover Park gameplay](artifacts/ui/park-playing.png)
- [Fullscreen pause screen](artifacts/ui/fullscreen.png)
- [Portrait fullscreen gameplay](artifacts/ui/fullscreen-mobile.png)

The test hook is inserted into an intercepted script response; it is not shipped in the production game. Test images and [results](artifacts/ui/test-results.json) are saved under the UI artifacts folder:

- [Desktop start screen](artifacts/ui/desktop-ready.png)
- [Desktop gameplay](artifacts/ui/desktop-playing.png)
- [Desktop game over](artifacts/ui/desktop-gameover.png)
- [Mobile start screen](artifacts/ui/mobile-ready.png)
- [Mobile game over](artifacts/ui/mobile-gameover.png)

To run tests in a standard Node.js development environment, run `npm install`, `npx playwright install chromium`, then `npm test` from this directory. Alternatively set `CHROME_PATH` to an installed Chrome executable. `PLAYWRIGHT_PATH` can point to a nonstandard Playwright package installation.

Run `npm run test:features` while the localhost server is running. Set `GAME_URL` to test another local serving address. Browser-injected testing hooks never modify the production bundle or save data in your normal browser profile.
