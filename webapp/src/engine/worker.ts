/// <reference lib="webworker" />
/* Web Worker entry for the flood engine.
 * Load from client code with:
 *   new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' })
 * (Turbopack/webpack both recognise this pattern and bundle the worker; see client.ts.)
 * Messages: EngineCommand in, EngineMessage out (types/engine.ts). All messages are posted by
 * structured clone WITHOUT transfer lists, so the main thread never ends up with detached buffers. */

import type { EngineCommand, EngineMessage } from '../types/engine';
import { EngineRuntime, type EngineInit } from './runtime';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let rt: EngineRuntime | null = null;
let running = false;
let scheduled = false;
const CHUNK_MS = 40;

function post(m: EngineMessage): void { ctx.postMessage(m); }

function fail(e: unknown): void {
  running = false;
  post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
}

function loop(): void {
  scheduled = false;
  if (!running || !rt) return;
  try {
    const finished = rt.runChunk(CHUNK_MS, post);
    if (finished) { running = false; return; }
  } catch (e) { fail(e); return; }
  schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  // yield to the event loop so pause/stop commands are processed between chunks
  setTimeout(loop, 0);
}

ctx.onmessage = (ev: MessageEvent<EngineCommand>) => {
  const cmd = ev.data;
  try {
    switch (cmd.type) {
      case 'init':
        running = false;
        rt = new EngineRuntime(cmd.config as EngineInit);
        post(rt.readyMessage());
        break;
      case 'run':
        if (!rt) throw new Error('run before init');
        if (rt.done) break;
        running = true; schedule();
        break;
      case 'pause':
        running = false;
        break;
      case 'stop':
        running = false;
        if (rt) rt.stop(post);
        break;
      default:
        throw new Error(`unknown command ${(cmd as { type?: string }).type}`);
    }
  } catch (e) { fail(e); }
};
