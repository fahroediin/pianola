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
  const soundings = layout(song, speed);
  const errors = findKeyClashes(soundings);
  if (errors.length > 0) return { actions: [], errors };
  return { actions: toActions(soundings), errors: [] };
}

function findKeyClashes(soundings: Sounding[]): SongError[] {
  const errors: SongError[] = [];
  const byKey = new Map<string, Sounding[]>();
  for (const s of soundings) byKey.set(s.key, [...(byKey.get(s.key) ?? []), s]);
  for (const list of byKey.values()) {
    list.sort((a, b) => a.start - b.start);
    let holder = list[0];
    for (const s of list.slice(1)) {
      if (s.start < holder.end) {
        errors.push({
          line: s.line,
          message: `bentrok tombol: ${holder.note} (baris ${holder.line}) dan ${s.note} (baris ${s.line}) memakai tombol yang sama pada waktu bersamaan`,
        });
      }
      if (s.end > holder.end) holder = s;
    }
  }
  return errors.sort((a, b) => a.line - b.line);
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
  const pressKey = (s: Sounding) => (s.shift ? s.key.toUpperCase() : s.key);

  // Unity samples Shift once per frame at key press: naturals go first, sharps get Shift held SHIFT_HOLD_MS.
  const byStart = [...soundings].sort((a, b) => a.start - b.start || Number(a.shift) - Number(b.shift));
  let shiftHeld = false;
  let shiftUpAt = 0;
  for (const s of byStart) {
    let at = s.start;
    if (s.shift) {
      if (shiftHeld && at > shiftUpAt) {
        actions.push({ at: shiftUpAt, type: 'up', key: 'Shift' });
        shiftHeld = false;
      }
      if (!shiftHeld) {
        actions.push({ at, type: 'down', key: 'Shift' });
        shiftHeld = true;
      }
      shiftUpAt = at + SHIFT_HOLD_MS;
    } else if (shiftHeld) {
      if (at < shiftUpAt) at = shiftUpAt;
      actions.push({ at: shiftUpAt, type: 'up', key: 'Shift' });
      shiftHeld = false;
    }
    s.down = at;
    actions.push({ at, type: 'down', key: pressKey(s) });
  }
  if (shiftHeld) actions.push({ at: shiftUpAt, type: 'up', key: 'Shift' });

  for (const s of soundings) actions.push({ at: releaseAt(s), type: 'up', key: pressKey(s) });
  return sortActions(actions);
}

function sortActions(actions: Action[]): Action[] {
  const rank = (a: Action) => (a.type === 'up' ? 0 : 1);
  return actions
    .map((a, order) => ({ a: { ...a, at: round(a.at) }, order }))
    .sort((x, y) => x.a.at - y.a.at || rank(x.a) - rank(y.a) || x.order - y.order)
    .map(({ a }) => a);
}
