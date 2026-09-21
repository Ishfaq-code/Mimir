import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import ts from 'typescript';

const temp = mkdtempSync(join(process.cwd(), '.touch-check-'));
try {
  const output = join(temp, 'touchNavigation.cjs');
  writeFileSync(output, ts.transpileModule(readFileSync('lib/canvas/touchNavigation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const { TouchNavigation } = createRequire(import.meta.url)(output);
  const point = (x, y = 100) => ({ x, y });
  const camera = { x: 10, y: 20, zoom: 2 };
  const touch = new TouchNavigation();

  touch.begin(1, point(100), camera, false);
  assert.equal(touch.active, true);
  assert.equal(touch.move(1, point(102)), null, 'Tiny movements do not jerk the page');
  let moved = touch.move(1, point(140, 120));
  assert.deepEqual(moved, { x: -10, y: 10, zoom: 2 }, 'Pan uses world units at the current zoom');
  assert.equal(touch.end(1, point(140, 120), moved), null, 'Finger navigation never creates text in other tools');
  assert.equal(touch.active, false);

  touch.begin(1, point(100), camera, false);
  touch.begin(2, point(200), camera, false);
  assert.deepEqual(touch.move(2, point(200)), camera, 'Adding the second finger does not jump');
  moved = touch.move(2, point(300));
  assert.deepEqual(moved, { x: 35, y: 45, zoom: 4 }, 'Pinch both zooms and follows the moving midpoint');
  assert.deepEqual({ x: moved.x + 200 / moved.zoom, y: moved.y + 100 / moved.zoom },
    { x: camera.x + 150 / camera.zoom, y: camera.y + 100 / camera.zoom }, 'The world point under the pinch stays anchored');
  touch.end(2, point(300), moved);
  assert.deepEqual(touch.move(1, point(100)), moved, 'Lifting one finger does not jump');
  moved = touch.move(1, point(140));
  assert.deepEqual(moved, { x: 25, y: 45, zoom: 4 }, 'The remaining finger continues to pan');
  touch.begin(3, point(240), moved, false);
  assert.deepEqual(touch.move(3, point(240)), moved, 'Returning to two fingers preserves the camera');
  touch.begin(4, point(500), moved, false);
  assert.deepEqual(touch.move(4, point(550)), moved, 'An extra finger does not distort the active pinch');
  touch.end(1, point(140), moved);
  assert.deepEqual(touch.move(3, point(240)), moved, 'Changing the pinch pair rebases without a jump');
  touch.clear();

  touch.begin(1, point(100), camera, true);
  assert.deepEqual(touch.end(1, point(101), camera), point(101), 'A single Text-tool tap can open the editor');
  touch.begin(1, point(100), camera, true);
  moved = touch.move(1, point(120));
  touch.move(1, point(100));
  assert.equal(touch.end(1, point(100), moved), null, 'Dragging out and back is not a text tap');
  touch.begin(1, point(100), camera, true);
  touch.begin(2, point(200), camera, true);
  assert.equal(touch.end(2, point(200), camera), null);
  assert.equal(touch.end(1, point(100), camera), null, 'Pinching in Text mode cannot create an editor');
  touch.begin(1, point(100), camera, true);
  assert.equal(touch.end(1, point(100), camera, true), null, 'Cancellation/lost capture cannot create text');
  touch.begin(1, point(100), camera, true);
  assert.equal(touch.end(1, point(120), camera), null, 'A distant release is not a tap even without move events');

  touch.begin(1, point(100), camera, false);
  touch.begin(2, point(200), camera, false);
  assert.deepEqual(touch.clear(), [1, 2], 'Pencil takeover returns captured finger IDs for release');
  assert.equal(touch.active, false);
  assert.equal(touch.move(1, point(500)), null, 'A held palm cannot resume panning after Pencil takeover');
  assert.equal(touch.end(2, point(200), camera), null);
  touch.begin(3, point(100), camera, false);
  assert.deepEqual(touch.move(3, point(120)), { x: 0, y: 20, zoom: 2 }, 'A new finger gesture works after takeover');
  touch.clear();

  touch.begin(1, point(100), camera, false);
  touch.begin(2, point(200), camera, false);
  assert.equal(touch.move(2, point(10000)).zoom, 10, 'Pinch respects the maximum zoom');
  moved = touch.move(2, point(100));
  assert.equal(moved.zoom, 0.1, 'Overlapping fingers respect the minimum zoom');
  assert.ok(Object.values(moved).every(Number.isFinite));
  touch.clear();
  touch.begin(1, point(100), camera, false);
  touch.begin(2, point(100), camera, false);
  assert.ok(Object.values(touch.move(2, point(200))).every(Number.isFinite), 'A zero-distance pinch cannot produce invalid coordinates');

  console.log('Passed: finger panning, anchored pinch zoom, gesture transitions, Text taps, cancellation, Pencil takeover, and zoom limits.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
