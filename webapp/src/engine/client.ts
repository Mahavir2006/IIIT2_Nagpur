/* Typed main-thread wrapper around the engine worker, with a main-thread fallback.
 *
 *   const eng = new EngineClient();
 *   const off = eng.onMessage(m => { ... });
 *   eng.init({ ...config, bbox: scenario.bbox });   // bbox is required to place the dam
 *   eng.run(); eng.pause(); eng.stop(); eng.dispose();
 *
 * Only use from client components ('use client'): it touches Worker/window. */

import type { EngineCommand, EngineMessage } from '../types/engine';
import type { EngineInit } from './runtime';

export type { EngineInit } from './runtime';
type Listener = (m: EngineMessage) => void;

export class EngineClient {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  /** Fallback state */
  private rt: import('./runtime').EngineRuntime | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fallbackLoading: Promise<void> | null = null;
  private heardFromWorker = false;
  /** Commands sent before the worker answered (replayed on the fallback if it fails to load). */
  private sent: EngineCommand[] = [];
  mode: 'worker' | 'main-thread' = 'worker';

  constructor(onMessage?: Listener) {
    if (onMessage) this.listeners.add(onMessage);
    try {
      if (typeof Worker === 'undefined') throw new Error('no Worker');
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<EngineMessage>) => { this.heardFromWorker = true; this.emit(e.data); };
      this.worker.onerror = (e: ErrorEvent) => {
        if (!this.heardFromWorker) {
          // worker script failed to load/evaluate: switch to the main thread and replay commands
          e.preventDefault?.();
          this.worker?.terminate(); this.worker = null; this.mode = 'main-thread';
          const replay = this.sent; this.sent = [];
          for (const c of replay) void this.fallback(c);
          return;
        }
        this.emit({ type: 'error', message: `engine worker error: ${e.message || 'unknown'}` });
      };
    } catch {
      this.worker = null;
      this.mode = 'main-thread';
    }
  }

  onMessage(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private emit(m: EngineMessage): void { for (const l of this.listeners) l(m); }

  private send(cmd: EngineCommand): void {
    if (this.worker) {
      if (!this.heardFromWorker) { if (cmd.type === 'init') this.sent = []; this.sent.push(cmd); }
      this.worker.postMessage(cmd);
      return;
    }
    void this.fallback(cmd);
  }

  init(config: EngineInit): void { this.send({ type: 'init', config }); }
  run(): void { this.send({ type: 'run' }); }
  pause(): void { this.send({ type: 'pause' }); }
  stop(): void { this.send({ type: 'stop' }); }

  dispose(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null; this.rt = null;
    this.listeners.clear();
  }

  // ------------------------------------------------------------ main-thread fallback
  private async fallback(cmd: EngineCommand): Promise<void> {
    try {
      if (cmd.type === 'init') {
        this.running = false;
        this.fallbackLoading = import('./runtime').then(({ EngineRuntime }) => {
          // copy the DEM so the engine never shares a buffer with the caller
          const cfg = { ...(cmd.config as EngineInit), dem: cmd.config.dem.slice() };
          this.rt = new EngineRuntime(cfg);
          this.emit(this.rt.readyMessage());
        });
        await this.fallbackLoading;
        return;
      }
      if (this.fallbackLoading) await this.fallbackLoading;
      if (cmd.type === 'run') {
        if (!this.rt) throw new Error('run before init');
        if (this.rt.done || this.running) return;
        this.running = true; this.tick();
      } else if (cmd.type === 'pause') {
        this.running = false;
      } else if (cmd.type === 'stop') {
        this.running = false;
        this.rt?.stop(m => this.emit(m));
      }
    } catch (e) {
      this.running = false;
      this.emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private tick = (): void => {
    this.timer = null;
    if (!this.running || !this.rt) return;
    try {
      // short chunks keep the UI responsive when running on the main thread
      if (this.rt.runChunk(12, m => this.emit(m))) { this.running = false; return; }
    } catch (e) {
      this.running = false;
      this.emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    this.timer = setTimeout(this.tick, 0);
  };
}
