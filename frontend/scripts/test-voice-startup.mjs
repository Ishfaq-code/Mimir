import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import ts from 'typescript';
import { ParticipantEvent, RoomEvent } from 'livekit-client';

const temp = mkdtempSync(join(process.cwd(), '.voice-check-'));
try {
  const output = join(temp, 'startup.cjs');
  writeFileSync(output, ts.transpileModule(readFileSync('lib/livekit/startup.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  const { waitForTutor, connectWithRetry } = createRequire(import.meta.url)(output);
  const room = () => Object.assign(new EventEmitter(), { remoteParticipants: new Map() });
  const agent = state => Object.assign(new EventEmitter(), { isAgent: true, attributes: { 'lk.agent.state': state } });
  const clean = (r, p) => { assert.equal(r.eventNames().length, 0); if (p) assert.equal(p.eventNames().length, 0); };

  const existing = room(), ready = agent('listening'); existing.remoteParticipants.set('agent', ready);
  await waitForTutor(existing, new AbortController().signal); clean(existing, ready);

  const joining = room(), warming = agent('initializing');
  const joined = waitForTutor(joining, new AbortController().signal);
  joining.emit(RoomEvent.ParticipantConnected, warming);
  warming.attributes['lk.agent.state'] = 'speaking'; warming.emit(ParticipantEvent.AttributesChanged);
  await joined; clean(joining, warming);

  const dropped = room(), leaving = agent('initializing');
  const failed = waitForTutor(dropped, new AbortController().signal);
  dropped.emit(RoomEvent.ParticipantConnected, leaving); dropped.emit(RoomEvent.ParticipantDisconnected, leaving);
  await assert.rejects(failed, /dropped/); clean(dropped, leaving);

  const timed = room();
  await assert.rejects(waitForTutor(timed, new AbortController().signal, 5), /timed out/); clean(timed);

  const cancelled = room(), abort = new AbortController();
  const cancelledJoin = waitForTutor(cancelled, abort.signal); abort.abort();
  await assert.rejects(cancelledJoin, { name: 'AbortError' }); clean(cancelled);
  await assert.rejects(waitForTutor(cancelled, abort.signal), { name: 'AbortError' }); clean(cancelled);

  let starts = 0, closes = 0, retries = 0;
  await connectWithRetry(async () => { starts++; if (starts === 1) throw Error('transport'); }, async () => { closes++; }, new AbortController().signal, () => { retries++; });
  assert.deepEqual([starts, closes, retries], [2, 1, 1]);

  starts = closes = retries = 0;
  await assert.rejects(connectWithRetry(async () => { starts++; throw Error('transport'); }, async () => { closes++; }, new AbortController().signal, () => { retries++; }), /transport/);
  assert.deepEqual([starts, closes, retries], [2, 2, 1], 'Startup cannot loop indefinitely');

  starts = closes = retries = 0;
  const manualStop = new AbortController();
  await assert.rejects(connectWithRetry(async () => { starts++; manualStop.abort(); throw new DOMException('Stopped', 'AbortError'); }, async () => { closes++; }, manualStop.signal, () => { retries++; }), { name: 'AbortError' });
  assert.deepEqual([starts, closes, retries], [1, 1, 0], 'Manual cancellation never reconnects');

  starts = closes = retries = 0;
  await connectWithRetry(async () => { starts++; }, async () => { closes++; }, new AbortController().signal, () => { retries++; });
  assert.deepEqual([starts, closes, retries], [1, 0, 0]);
  console.log('Passed: existing/arriving tutor, startup drop, timeout, cancellation, listener cleanup, one retry, bounded failure, and no reconnect after manual stop.');
} finally { rmSync(temp, { recursive: true, force: true }); }
