/* Build only the three browser assets for static hosting.
 * Tests, local servers, screenshots, and development dependencies are never public.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of ['index.html', 'style.css', 'game.js']) {
  fs.copyFileSync(path.join(__dirname, file), path.join(output, file));
}
console.log('Built Good Dog Dash: dist/index.html, dist/style.css, dist/game.js');
