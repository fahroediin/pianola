import { chromium, type Browser, type Page } from 'playwright';
import type { Action } from './schedule.ts';

export type PlayerState = 'loading' | 'ready' | 'playing' | 'done' | 'stopped' | 'error';
export interface PlayerStatus { state: PlayerState; message?: string }
export interface Player {
  status(): PlayerStatus;
  play(actions: Action[]): Promise<void>;
  stop(): Promise<void>;
}

const PIANO_URL = 'https://recursivearts.com/virtual-piano/';
const LOAD_WAIT_MS = 15000; // Unity build needs ~15 s after the start button (measured in spike)
const FRAME_TIMEOUT_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PianoPlayer implements Player {
  private browser: Browser | undefined;
  private page: Page | undefined;
  private current: PlayerStatus = { state: 'loading' };
  private runId = 0;
  private pressed = new Set<string>();
  private loading: Promise<void> | undefined;

  status(): PlayerStatus {
    return this.current;
  }

  ensureReady(): Promise<void> {
    if (this.page && !this.page.isClosed()) return Promise.resolve();
    if (!this.loading) this.loading = this.load().finally(() => { this.loading = undefined; });
    return this.loading;
  }

  async play(actions: Action[]): Promise<void> {
    const run = ++this.runId;
    try {
      await this.releaseAll();
      await this.ensureReady();
      if (run !== this.runId) return;
      this.current = { state: 'playing' };
      await this.focus();
      const keyboard = this.page!.keyboard;
      const t0 = performance.now();
      let keysSinceFrame = false;
      for (const action of actions) {
        // Absolute clock: a late action does not push back the ones after it.
        const wait = action.at - (performance.now() - t0);
        if (wait > 0) await sleep(wait);
        if (run !== this.runId) return;
        // Unity reads Shift once per frame; a Shift change must not share a frame with earlier key presses.
        if (action.key === 'Shift' && keysSinceFrame) {
          await this.nextFrame();
          keysSinceFrame = false;
          if (run !== this.runId) return;
        }
        keysSinceFrame = true;
        if (action.type === 'down') {
          await keyboard.down(action.key);
          if (run !== this.runId) { await keyboard.up(action.key).catch(() => {}); return; }
          this.pressed.add(action.key);
        } else {
          await keyboard.up(action.key);
          this.pressed.delete(action.key);
        }
      }
      if (run === this.runId) this.current = { state: 'done' };
    } catch (err) {
      if (run === this.runId) this.current = { state: 'error', message: `Gagal memainkan: ${(err as Error).message}` };
    }
  }

  async stop(): Promise<void> {
    this.runId++;
    await this.releaseAll();
    if (this.current.state === 'playing') this.current = { state: 'stopped' };
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }

  private async load(): Promise<void> {
    this.current = { state: 'loading' };
    try {
      if (!this.browser?.isConnected()) {
        // Keep Unity's frame loop running even when the window is covered by other windows.
        this.browser = await chromium.launch({
          headless: false,
          args: [
            '--autoplay-policy=no-user-gesture-required',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ],
        });
      }
      const page = await this.browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(PIANO_URL, { waitUntil: 'domcontentloaded' });
      await page.click('.piano-load-button', { timeout: 30000 });
      await page.waitForTimeout(LOAD_WAIT_MS);
      await page.locator('#canvas').scrollIntoViewIfNeeded();
      this.page = page;
      await this.focus();
      this.current = { state: 'ready' };
    } catch (err) {
      this.current = { state: 'error', message: `Gagal memuat piano: ${(err as Error).message}` };
      throw err;
    }
  }

  // Resolves once the page has rendered a new frame, i.e. Unity has processed the keys sent so far.
  private async nextFrame(): Promise<void> {
    await this.page!.evaluate((timeout) => new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeout);
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
    }), FRAME_TIMEOUT_MS);
  }

  // Unity only receives keys after the canvas has been clicked once.
  private async focus(): Promise<void> {
    const canvas = this.page!.locator('#canvas');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: (box?.width ?? 800) / 2, y: 20 } });
  }

  private async releaseAll(): Promise<void> {
    const keys = [...this.pressed];
    this.pressed.clear();
    if (!this.page || this.page.isClosed()) return;
    for (const key of keys) await this.page.keyboard.up(key).catch(() => {});
    await this.page.keyboard.up('Shift').catch(() => {});
  }
}
