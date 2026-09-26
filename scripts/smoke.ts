import { readFileSync } from 'node:fs';
import { parse, formatError } from '../src/notation.ts';
import { schedule } from '../src/schedule.ts';
import { PianoPlayer } from '../src/player.ts';

const file = process.argv[2] ?? 'songs/uji-kres.txt';
const parsed = parse(readFileSync(file, 'utf8'));
const { actions, errors } = schedule(parsed.song);
const all = [...parsed.errors, ...errors];
if (all.length > 0) {
  console.error(all.map(formatError).join('\n'));
  process.exit(1);
}

const player = new PianoPlayer();
console.log('Memuat piano...');
await player.ensureReady();
console.log(`Memainkan ${file} (${actions.length} aksi)`);
await player.play(actions);
console.log('Status akhir:', player.status());
await player.close();
