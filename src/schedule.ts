import { noteToKey } from './keymap.ts';
import type { Song, SongError } from './notation.ts';

export interface Action { at: number; type: 'down' | 'up'; key: string }
export interface ScheduleResult { actions: Action[]; errors: SongError[] }

export const SHIFT_HOLD_MS = 40;
export const MIN_HOLD_MS = 20;
const MAX_GAP_MS = 30;

interface Sounding {
  note: string;
  key: string;
  shift: boolean;
  start: number;
  end: number;
  line: number;
  down: number; // actual press time after Shift adjustments
}

const round = (ms: number) => Math.round(ms * 1000) / 1000;

export function schedule(song: Song, speed = 1): ScheduleResult {
  return { actions: toActions(layout(song, speed)), errors: [] };
}

function layout(song: Song, speed: number): Sounding[] {
  const beatMs = 60000 / (song.tempo * speed);
  const out: Sounding[] = [];
  let blockStart = 0;
  for (const block of song.blocks) {
    let longest = 0;
    for (const track of block.tracks) {
      let t = 0;
      for (const ev of track.events) {
        const dur = ev.beats * beatMs;
        for (const note of ev.notes) {
          const press = noteToKey(note)!;
          out.push({
            note, key: press.key, shift: press.shift,
            start: round(blockStart + t), end: round(blockStart + t + dur),
            line: ev.line, down: 0,
          });
        }
        t += dur;
      }
      longest = Math.max(longest, t);
    }
    blockStart += longest;
  }
  return out;
}

function releaseAt(s: Sounding): number {
  const gap = Math.min(MAX_GAP_MS, (s.end - s.start) * 0.1);
  return Math.max(s.end - gap, s.down + MIN_HOLD_MS);
}

function toActions(soundings: Sounding[]): Action[] {
  const actions: Action[] = [];
  for (const s of soundings) {
    s.down = s.start;
    actions.push({ at: s.down, type: 'down', key: s.key });
  }
  for (const s of soundings) actions.push({ at: releaseAt(s), type: 'up', key: s.key });
  return sortActions(actions);
}

function sortActions(actions: Action[]): Action[] {
  const rank = (a: Action) => (a.type === 'up' ? 0 : 1);
  return actions
    .map((a, order) => ({ a: { ...a, at: round(a.at) }, order }))
    .sort((x, y) => x.a.at - y.a.at || rank(x.a) - rank(y.a) || x.order - y.order)
    .map(({ a }) => a);
}
