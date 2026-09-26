import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server.ts';
import type { Player, PlayerStatus } from '../src/player.ts';
import type { Action } from '../src/schedule.ts';

class FakePlayer implements Player {
  played: Action[][] = [];
  stops = 0;
  current: PlayerStatus = { state: 'ready' };
  status() { return this.current; }
  async play(actions: Action[]) { this.played.push(actions); }
  async stop() { this.stops++; }
}

const panelPath = fileURLToPath(new URL('../public/panel.html', import.meta.url));

async function withServer(player: Player, fn: (base: string) => Promise<void>) {
  const server = createApp(player, panelPath);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

test('GET / serves the panel', async () => {
  await withServer(new FakePlayer(), async (base) => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<textarea/);
  });
});

test('GET /status returns the player status', async () => {
  await withServer(new FakePlayer(), async (base) => {
    assert.deepEqual(await (await fetch(base + '/status')).json(), { state: 'ready' });
  });
});

test('POST /play with notation errors returns 400 and does not play', async () => {
  const player = new FakePlayer();
  await withServer(player, async (base) => {
    const res = await post(base + '/play', { text: 'RH: A1', speed: 1 });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { errors: ['baris 1: A1 di luar jangkauan piano (C2-C7)'] });
    assert.equal(player.played.length, 0);
  });
});

test('POST /play with a key clash returns 400', async () => {
  await withServer(new FakePlayer(), async (base) => {
    const res = await post(base + '/play', { text: 'RH: E4\nLH: E4', speed: 1 });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      errors: ['baris 2: bentrok tombol: E4 (baris 1) dan E4 (baris 2) memakai tombol yang sama pada waktu bersamaan'],
    });
  });
});

test('POST /play rejects speed outside 0.5-2', async () => {
  await withServer(new FakePlayer(), async (base) => {
    const res = await post(base + '/play', { text: 'RH: C4', speed: 3 });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { errors: ['kecepatan harus 50-200%'] });
  });
});

test('POST /play with valid notation plays the scheduled actions', async () => {
  const player = new FakePlayer();
  await withServer(player, async (base) => {
    const res = await post(base + '/play', { text: 'tempo: 60\nRH: C4', speed: 1 });
    assert.equal(res.status, 200);
    assert.deepEqual(player.played, [[{ at: 0, type: 'down', key: 't' }, { at: 970, type: 'up', key: 't' }]]);
  });
});

test('POST /stop stops the player', async () => {
  const player = new FakePlayer();
  await withServer(player, async (base) => {
    assert.equal((await post(base + '/stop')).status, 200);
    assert.equal(player.stops, 1);
  });
});

test('unknown route is 404', async () => {
  await withServer(new FakePlayer(), async (base) => {
    assert.equal((await fetch(base + '/nope')).status, 404);
  });
});
