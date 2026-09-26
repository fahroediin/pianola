import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parse, formatError } from './notation.ts';
import { schedule } from './schedule.ts';
import type { Player } from './player.ts';

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export function createApp(player: Player, panelPath: string): Server {
  return createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(await readFile(panelPath));
        return;
      }
      if (req.method === 'GET' && req.url === '/status') {
        json(res, 200, player.status());
        return;
      }
      if (req.method === 'POST' && req.url === '/play') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const text = typeof body.text === 'string' ? body.text : '';
        const speed = Number(body.speed ?? 1);
        if (!(speed >= 0.5 && speed <= 2)) {
          json(res, 400, { errors: ['kecepatan harus 50-200%'] });
          return;
        }
        const parsed = parse(text);
        if (parsed.errors.length > 0) {
          json(res, 400, { errors: parsed.errors.map(formatError) });
          return;
        }
        const scheduled = schedule(parsed.song, speed);
        if (scheduled.errors.length > 0) {
          json(res, 400, { errors: scheduled.errors.map(formatError) });
          return;
        }
        void player.play(scheduled.actions); // runs in the background; progress via /status
        json(res, 200, { ok: true, actions: scheduled.actions.length });
        return;
      }
      if (req.method === 'POST' && req.url === '/stop') {
        await player.stop();
        json(res, 200, { ok: true });
        return;
      }
      json(res, 404, { errors: ['tidak ditemukan'] });
    } catch (err) {
      json(res, 500, { errors: [(err as Error).message] });
    }
  });
}
