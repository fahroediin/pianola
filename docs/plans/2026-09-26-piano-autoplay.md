# Piano Autoplay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel web lokal yang menerima notasi lagu (format ketat RH/LH) lalu memainkannya otomatis di piano Unity https://recursivearts.com/virtual-piano/ lewat Playwright.

**Architecture:** Tiga modul murni (`keymap` -> `notation` -> `schedule`) mengubah teks menjadi daftar aksi keyboard berwaktu absolut, dan semuanya dites otomatis. `player` (Playwright) hanya mengeksekusi aksi. `server` (node:http) menghubungkan panel HTML dengan parser dan player. Player disuntikkan ke server supaya server bisa dites dengan player palsu.

**Tech Stack:** Node 24 (TypeScript dijalankan langsung lewat type stripping), `node:test`, `node:http`, Playwright 1.58.2.

**Spec:** `docs/specs/2026-09-26-piano-autoplay-design.md`

## Global Constraints

- Node >= 24. File `.ts` dijalankan langsung tanpa build. Hanya sintaks TypeScript yang bisa dihapus: tanpa `enum`, `namespace`, dan parameter properties di constructor. Import tipe wajib `import type`. Import relatif wajib berakhiran `.ts`.
- Satu dependensi runtime: `playwright` versi `1.58.2`. Tanpa dependensi lain (tanpa express, tanpa test runner eksternal).
- Jangkauan piano C2-C7. Tombol natural `1234567890qwertyuiopasdfghjklzxcvbnm` = C2..C7. Kres = Shift + tombol natural.
- Konstanta: tempo default 90, rentang 20-300; kecepatan 0.5-2 (panel 50-200%); `SHIFT_HOLD_MS = 40`; gap lepas `min(30, dur * 0.1)` ms; `MIN_HOLD_MS = 20`.
- Server hanya di `127.0.0.1:5178`.
- Pesan error berbahasa Indonesia, dengan teks persis seperti di tes. Format tampilan: `baris N: <pesan>`, atau `<pesan>` saja bila `line = 0`.
- `songs/` hanya berisi lagu domain publik.
- Pesan commit tanpa trailer atribusi.
- Jalankan tes: `npm test` (= `node --test "test/*.test.ts"`).

## File Structure

```
piano-autoplay/
  package.json            scripts: start, test, smoke
  src/keymap.ts           normalizeNote, noteToKey
  src/notation.ts         tipe Song + parse + formatError
  src/schedule.ts         schedule(song, speed) -> { actions, errors }
  src/player.ts           PianoPlayer (Playwright) + interface Player
  src/server.ts           createApp(player, panelPath)
  src/main.ts             titik masuk
  public/panel.html       UI
  scripts/smoke.ts        uji manual player
  songs/ode-to-joy.txt, songs/twinkle.txt, songs/uji-kres.txt
  test/keymap.test.ts, test/notation.test.ts, test/schedule.test.ts, test/songs.test.ts, test/server.test.ts
```

---

### Task 1: Scaffold + keymap

**Files:**
- Create: `package.json`, `src/keymap.ts`, `test/keymap.test.ts`

**Interfaces:**
- Consumes: tidak ada
- Produces:
  - `export interface KeyPress { key: string; shift: boolean }`
  - `export function normalizeNote(note: string): string | null`: nama not apa pun (huruf besar/kecil, `#`/`b`) ke nama kanonik kres, contoh `'bb5' -> 'A#5'`, `'Cb4' -> 'B3'`. Mengembalikan `null` bila tidak valid. Tidak mengecek jangkauan.
  - `export function noteToKey(note: string): KeyPress | null`: mengembalikan `null` bila tidak valid atau di luar C2-C7. `key` selalu tombol natural huruf kecil/angka.

- [ ] **Step 1: Buat package.json dan pasang Playwright**

```json
{
  "name": "piano-autoplay",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "start": "node src/main.ts",
    "test": "node --test \"test/*.test.ts\"",
    "smoke": "node scripts/smoke.ts"
  },
  "dependencies": {
    "playwright": "1.58.2"
  }
}
```

Run: `npm install`
Expected: `added N packages`, tanpa error. Chromium Playwright sudah ada di cache mesin. Kalau belum ada, jalankan `npx playwright install chromium`.

- [ ] **Step 2: Tulis tes yang gagal** (`test/keymap.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteToKey, normalizeNote } from '../src/keymap.ts';

test('natural notes at the range edges', () => {
  assert.deepEqual(noteToKey('C2'), { key: '1', shift: false });
  assert.deepEqual(noteToKey('C7'), { key: 'm', shift: false });
});

test('all twelve pitch names in octave 4', () => {
  const got = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4'].map((n) => noteToKey(n));
  assert.deepEqual(got, [
    { key: 't', shift: false }, { key: 't', shift: true },
    { key: 'y', shift: false }, { key: 'y', shift: true },
    { key: 'u', shift: false },
    { key: 'i', shift: false }, { key: 'i', shift: true },
    { key: 'o', shift: false }, { key: 'o', shift: true },
    { key: 'p', shift: false }, { key: 'p', shift: true },
    { key: 'a', shift: false },
  ]);
});

test('sharps on digit keys and upper octaves', () => {
  assert.deepEqual(noteToKey('C#2'), { key: '1', shift: true });
  assert.deepEqual(noteToKey('A#5'), { key: 'j', shift: true });
  assert.deepEqual(noteToKey('C3'), { key: '8', shift: false });
});

test('flats are accepted', () => {
  assert.deepEqual(noteToKey('Db4'), { key: 't', shift: true });
});

test('out of range or invalid returns null', () => {
  for (const n of ['B1', 'A1', 'C#7', 'D7', 'H4', '']) assert.equal(noteToKey(n), null, n);
});

test('normalizeNote maps spellings to canonical sharp names', () => {
  assert.equal(normalizeNote('c4'), 'C4');
  assert.equal(normalizeNote('Bb5'), 'A#5');
  assert.equal(normalizeNote('bb5'), 'A#5');
  assert.equal(normalizeNote('Cb4'), 'B3');
  assert.equal(normalizeNote('Fb4'), 'E4');
  assert.equal(normalizeNote('E#4'), 'F4');
  assert.equal(normalizeNote('B#3'), 'C4');
  assert.equal(normalizeNote('A1'), 'A1');
  for (const bad of ['H4', 'C', 'C#', '4', 'C44', 'Cx4', '']) assert.equal(normalizeNote(bad), null, bad);
});
```

- [ ] **Step 3: Jalankan tes, pastikan gagal**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../src/keymap.ts'`.

- [ ] **Step 4: Implementasi** (`src/keymap.ts`)

```ts
const WHITE_KEYS = '1234567890qwertyuiopasdfghjklzxcvbnm';
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LOWEST_MIDI = 36; // C2
const HIGHEST_MIDI = 96; // C7

export interface KeyPress {
  key: string;
  shift: boolean;
}

function toMidi(note: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(\d)$/.exec(note);
  if (!m) return null;
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + SEMITONES[m[1].toUpperCase()] + accidental;
}

export function normalizeNote(note: string): string | null {
  const midi = toMidi(note);
  if (midi === null) return null;
  return PITCH_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

export function noteToKey(note: string): KeyPress | null {
  const midi = toMidi(note);
  if (midi === null || midi < LOWEST_MIDI || midi > HIGHEST_MIDI) return null;
  const name = PITCH_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  const whiteIndex = (octave - 2) * 7 + LETTERS.indexOf(name[0]);
  return { key: WHITE_KEYS[whiteIndex], shift: name.endsWith('#') };
}
```

- [ ] **Step 5: Jalankan tes, pastikan lulus**

Run: `npm test`
Expected: PASS, 6 tes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/keymap.ts test/keymap.test.ts
git commit -m "feat: keymap note name to piano keyboard key"
```

---

### Task 2: Parser notasi

**Files:**
- Create: `src/notation.ts`, `test/notation.test.ts`

**Interfaces:**
- Consumes: `normalizeNote`, `noteToKey` dari `src/keymap.ts`
- Produces:
  ```ts
  export type Hand = 'RH' | 'LH';
  export interface NoteEvent { notes: string[]; beats: number; line: number } // notes kosong = istirahat; nama kanonik ('A#5')
  export interface Track { hand: Hand; line: number; events: NoteEvent[] }
  export interface Block { tracks: Track[] }
  export interface Song { tempo: number; blocks: Block[] }
  export interface SongError { line: number; message: string } // line 0 = tidak terikat baris
  export interface ParseResult { song: Song; errors: SongError[] }
  export const DEFAULT_TEMPO = 90;
  export function parse(text: string): ParseResult;
  export function formatError(e: SongError): string;
  ```

- [ ] **Step 1: Tulis tes happy path yang gagal** (`test/notation.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, formatError } from '../src/notation.ts';

test('default tempo 90 and default duration 1', () => {
  const { song, errors } = parse('RH: C4 D4');
  assert.deepEqual(errors, []);
  assert.equal(song.tempo, 90);
  assert.deepEqual(song.blocks, [
    { tracks: [{ hand: 'RH', line: 1, events: [
      { notes: ['C4'], beats: 1, line: 1 },
      { notes: ['D4'], beats: 1, line: 1 },
    ] }] },
  ]);
});

test('explicit tempo, decimal durations, rests, chords and bar lines', () => {
  const { song, errors } = parse('tempo: 120\nRH: E4:0.5 R:2 | [e5 Bb5]:3');
  assert.deepEqual(errors, []);
  assert.equal(song.tempo, 120);
  assert.deepEqual(song.blocks[0].tracks[0].events, [
    { notes: ['E4'], beats: 0.5, line: 2 },
    { notes: [], beats: 2, line: 2 },
    { notes: ['E5', 'A#5'], beats: 3, line: 2 },
  ]);
});

test('blank lines split blocks; comment-only lines are ignored', () => {
  const text = [
    '# judul',
    'RH: C4',
    '# catatan di tengah blok',
    'LH: C3',
    '',
    '   ',
    '# bagian 2',
    'RH: D4 # komentar di akhir baris',
  ].join('\n');
  const { song, errors } = parse(text);
  assert.deepEqual(errors, []);
  assert.equal(song.blocks.length, 2);
  assert.deepEqual(song.blocks[0].tracks.map((t) => [t.hand, t.line]), [['RH', 2], ['LH', 4]]);
  assert.deepEqual(song.blocks[1].tracks[0].events, [{ notes: ['D4'], beats: 1, line: 8 }]);
});

test('# attached to a note is a sharp, not a comment', () => {
  const { song, errors } = parse('RH: C#4 [F#4 A#4]');
  assert.deepEqual(errors, []);
  assert.deepEqual(song.blocks[0].tracks[0].events.map((e) => e.notes), [['C#4'], ['F#4', 'A#4']]);
});

test('tempo line with trailing comment; labels are case-insensitive; CRLF ok', () => {
  const { song, errors } = parse('tempo: 90   # BPM\r\nrh: C4');
  assert.deepEqual(errors, []);
  assert.equal(song.tempo, 90);
  assert.equal(song.blocks[0].tracks[0].hand, 'RH');
});

test('formatError', () => {
  assert.equal(formatError({ line: 12, message: 'x' }), 'baris 12: x');
  assert.equal(formatError({ line: 0, message: 'y' }), 'y');
});
```

- [ ] **Step 2: Tambahkan tes error ke file yang sama**

```ts
const errorsOf = (text: string) => parse(text).errors.map(formatError);

test('note out of range', () => {
  assert.deepEqual(errorsOf('RH: C4\nLH: A1:6'), ['baris 2: A1 di luar jangkauan piano (C2-C7)']);
});

test('unknown token', () => {
  assert.deepEqual(errorsOf('RH: C4 H4'), ['baris 1: token "H4" tidak dikenal']);
});

test('invalid durations', () => {
  assert.deepEqual(errorsOf('RH: C4:0 D4:-1 E4:x F4:'), [
    'baris 1: durasi "0" tidak valid pada "C4:0"',
    'baris 1: durasi "-1" tidak valid pada "D4:-1"',
    'baris 1: durasi "x" tidak valid pada "E4:x"',
    'baris 1: durasi "" tidak valid pada "F4:"',
  ]);
});

test('chord problems', () => {
  assert.deepEqual(errorsOf('RH: [C4 E4'), ['baris 1: kurung akord "[" tidak ditutup']);
  assert.deepEqual(errorsOf('RH: C4 []'), ['baris 1: akord kosong']);
  assert.deepEqual(errorsOf('RH: [C4 C4]'), ['baris 1: not C4 ditulis dua kali dalam akord']);
  assert.deepEqual(errorsOf('RH: [C4 Q9]'), ['baris 1: token "Q9" tidak dikenal']);
  assert.deepEqual(errorsOf('RH: [C4 A1]'), ['baris 1: A1 di luar jangkauan piano (C2-C7)']);
});

test('label problems', () => {
  assert.deepEqual(errorsOf('XX: C4'), ['baris 1: label "XX" tidak dikenal, gunakan RH: atau LH:']);
  assert.deepEqual(errorsOf('C4 D4'), ['baris 1: baris harus diawali RH: atau LH:']);
  assert.deepEqual(errorsOf('RH: C4\nRH: D4'), ['baris 2: RH sudah ada di blok ini']);
});

test('tempo problems', () => {
  assert.deepEqual(errorsOf('tempo: 10\nRH: C4'), ['baris 1: tempo harus angka 20-300, bukan "10"']);
  assert.deepEqual(errorsOf('tempo: cepat\nRH: C4'), ['baris 1: tempo harus angka 20-300, bukan "cepat"']);
  assert.deepEqual(errorsOf('tempo: 90\ntempo: 100\nRH: C4'), ['baris 2: tempo ditulis lebih dari sekali']);
  assert.deepEqual(errorsOf('RH: C4\n\ntempo: 100'), ['baris 3: tempo harus ditulis sebelum blok pertama']);
});

test('nothing to play', () => {
  assert.deepEqual(errorsOf(''), ['tidak ada not untuk dimainkan']);
  assert.deepEqual(errorsOf('# hanya komentar\nRH: R:4'), ['tidak ada not untuk dimainkan']);
});

test('all errors are collected across lines', () => {
  assert.deepEqual(errorsOf('RH: A1\n\nLH: H4'), [
    'baris 1: A1 di luar jangkauan piano (C2-C7)',
    'baris 3: token "H4" tidak dikenal',
  ]);
});
```

- [ ] **Step 3: Jalankan tes, pastikan gagal**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../src/notation.ts'`. Tes keymap tetap lulus.

- [ ] **Step 4: Implementasi** (`src/notation.ts`)

```ts
import { normalizeNote, noteToKey } from './keymap.ts';

export type Hand = 'RH' | 'LH';
export interface NoteEvent { notes: string[]; beats: number; line: number }
export interface Track { hand: Hand; line: number; events: NoteEvent[] }
export interface Block { tracks: Track[] }
export interface Song { tempo: number; blocks: Block[] }
export interface SongError { line: number; message: string }
export interface ParseResult { song: Song; errors: SongError[] }

export const DEFAULT_TEMPO = 90;

export function formatError(e: SongError): string {
  return e.line > 0 ? `baris ${e.line}: ${e.message}` : e.message;
}

export function parse(text: string): ParseResult {
  const errors: SongError[] = [];
  const blocks: Block[] = [];
  let tempo = DEFAULT_TEMPO;
  let tempoSeen = false;
  let current: Block | null = null;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const fail = (message: string) => { errors.push({ line, message }); };
    const raw = lines[i];

    if (raw.trim() === '') { current = null; continue; }
    // A comment starts with # at line start or after whitespace; C#4 keeps its #.
    const content = raw.replace(/(^|\s)#.*$/, '').trim();
    if (content === '') continue;

    const tempoMatch = /^tempo\s*:\s*(.*)$/i.exec(content);
    if (tempoMatch) {
      if (blocks.length > 0) { fail('tempo harus ditulis sebelum blok pertama'); continue; }
      if (tempoSeen) { fail('tempo ditulis lebih dari sekali'); continue; }
      tempoSeen = true;
      const value = Number(tempoMatch[1]);
      if (tempoMatch[1] === '' || !Number.isFinite(value) || value < 20 || value > 300) {
        fail(`tempo harus angka 20-300, bukan "${tempoMatch[1]}"`);
        continue;
      }
      tempo = value;
      continue;
    }

    const labelMatch = /^([A-Za-z]+)\s*:(.*)$/.exec(content);
    if (!labelMatch) { fail('baris harus diawali RH: atau LH:'); continue; }
    const hand = labelMatch[1].toUpperCase();
    if (hand !== 'RH' && hand !== 'LH') {
      fail(`label "${labelMatch[1]}" tidak dikenal, gunakan RH: atau LH:`);
      continue;
    }
    if (!current) { current = { tracks: [] }; blocks.push(current); }
    if (current.tracks.some((t) => t.hand === hand)) { fail(`${hand} sudah ada di blok ini`); continue; }
    current.tracks.push({ hand, line, events: parseTrack(labelMatch[2], line, errors) });
  }

  const hasNotes = blocks.some((b) => b.tracks.some((t) => t.events.some((e) => e.notes.length > 0)));
  if (errors.length === 0 && !hasNotes) errors.push({ line: 0, message: 'tidak ada not untuk dimainkan' });

  return { song: { tempo, blocks }, errors };
}

function tokenize(body: string): { tokens: string[]; unclosed: boolean } {
  const tokens: string[] = [];
  const isSpace = (ch: string) => /\s/.test(ch);
  let i = 0;
  while (i < body.length) {
    if (isSpace(body[i])) { i++; continue; }
    let end = i;
    if (body[i] === '[') {
      const close = body.indexOf(']', i);
      if (close < 0) return { tokens, unclosed: true };
      end = close + 1;
    }
    while (end < body.length && !isSpace(body[end])) end++;
    tokens.push(body.slice(i, end));
    i = end;
  }
  return { tokens, unclosed: false };
}

function parseTrack(body: string, line: number, errors: SongError[]): NoteEvent[] {
  const fail = (message: string) => { errors.push({ line, message }); };
  const { tokens, unclosed } = tokenize(body);
  if (unclosed) fail('kurung akord "[" tidak ditutup');

  const events: NoteEvent[] = [];
  for (const token of tokens) {
    if (token === '|') continue;

    const colon = token.lastIndexOf(':');
    const head = colon >= 0 ? token.slice(0, colon) : token;
    let beats = 1;
    if (colon >= 0) {
      const rawBeats = token.slice(colon + 1);
      beats = Number(rawBeats);
      if (rawBeats === '' || !Number.isFinite(beats) || beats <= 0) {
        fail(`durasi "${rawBeats}" tidak valid pada "${token}"`);
        continue;
      }
    }

    if (head.toUpperCase() === 'R') { events.push({ notes: [], beats, line }); continue; }

    const isChord = head.startsWith('[') && head.endsWith(']');
    const names = isChord ? head.slice(1, -1).split(/\s+/).filter(Boolean) : [head];
    if (isChord && names.length === 0) { fail('akord kosong'); continue; }

    const notes: string[] = [];
    let ok = true;
    for (const name of names) {
      const note = normalizeNote(name);
      if (note === null) { fail(`token "${name}" tidak dikenal`); ok = false; continue; }
      if (noteToKey(note) === null) { fail(`${note} di luar jangkauan piano (C2-C7)`); ok = false; continue; }
      if (notes.includes(note)) { fail(`not ${note} ditulis dua kali dalam akord`); ok = false; continue; }
      notes.push(note);
    }
    if (ok) events.push({ notes, beats, line });
  }
  return events;
}
```

- [ ] **Step 5: Jalankan tes, pastikan lulus**

Run: `npm test`
Expected: PASS, semua tes keymap dan notation (6 + 14).

- [ ] **Step 6: Commit**

```bash
git add src/notation.ts test/notation.test.ts
git commit -m "feat: notation parser with per-line errors"
```

---

### Task 3: Schedule, bagian waktu (tanpa Shift)

**Files:**
- Create: `src/schedule.ts`, `test/schedule.test.ts`

**Interfaces:**
- Consumes: `noteToKey` (keymap), `Song`, `SongError` (notation, `import type`), `parse` (hanya di tes)
- Produces:
  ```ts
  export interface Action { at: number; type: 'down' | 'up'; key: string }
  export interface ScheduleResult { actions: Action[]; errors: SongError[] }
  export const SHIFT_HOLD_MS = 40;
  export const MIN_HOLD_MS = 20;
  export function schedule(song: Song, speed?: number): ScheduleResult; // speed default 1
  ```
  `actions` terurut: `at` naik, lalu `up` sebelum `down` pada `at` yang sama, lalu urutan penyisipan. `at` dibulatkan ke 0.001 ms.

- [ ] **Step 1: Tulis tes yang gagal** (`test/schedule.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/notation.ts';
import { schedule } from '../src/schedule.ts';

// tempo 60 => 1 beat = 1000 ms, so expected times stay readable
function rows(body: string, speed = 1) {
  const parsed = parse('tempo: 60\n' + body);
  assert.deepEqual(parsed.errors, []);
  const result = schedule(parsed.song, speed);
  assert.deepEqual(result.errors, []);
  return result.actions.map((a) => [a.at, a.type, a.key]);
}

test('single note: release 30 ms early', () => {
  assert.deepEqual(rows('RH: C4'), [[0, 'down', 't'], [970, 'up', 't']]);
});

test('short note: gap is 10% of duration', () => {
  assert.deepEqual(rows('RH: C4:0.1'), [[0, 'down', 't'], [90, 'up', 't']]);
});

test('repeated note is re-struck', () => {
  assert.deepEqual(rows('RH: E4 E4'), [[0, 'down', 'u'], [970, 'up', 'u'], [1000, 'down', 'u'], [1970, 'up', 'u']]);
});

test('rest delays the next note', () => {
  assert.deepEqual(rows('RH: R C4'), [[1000, 'down', 't'], [1970, 'up', 't']]);
});

test('chord presses all keys together', () => {
  assert.deepEqual(rows('RH: [C4 E4]'), [[0, 'down', 't'], [0, 'down', 'u'], [970, 'up', 't'], [970, 'up', 'u']]);
});

test('tracks in a block run in parallel; next block waits for the longest track', () => {
  assert.deepEqual(rows('RH: C4:2\nLH: C3\n\nRH: D4'), [
    [0, 'down', 't'], [0, 'down', '8'],
    [970, 'up', '8'], [1970, 'up', 't'],
    [2000, 'down', 'y'], [2970, 'up', 'y'],
  ]);
});

test('speed multiplies the tempo', () => {
  assert.deepEqual(rows('RH: C4 D4', 2), [[0, 'down', 't'], [470, 'up', 't'], [500, 'down', 'y'], [970, 'up', 'y']]);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../src/schedule.ts'`.

- [ ] **Step 3: Implementasi** (`src/schedule.ts`)

```ts
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
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm test`
Expected: PASS, semua tes termasuk 7 tes schedule.

- [ ] **Step 5: Commit**

```bash
git add src/schedule.ts test/schedule.test.ts
git commit -m "feat: schedule notes into timed key actions"
```

---

### Task 4: Schedule, aturan Shift untuk not kres

**Files:**
- Modify: `src/schedule.ts` (ganti fungsi `toActions`)
- Test: `test/schedule.test.ts` (tambah tes)

**Interfaces:**
- Consumes: `Sounding`, `releaseAt`, `sortActions`, `SHIFT_HOLD_MS` dari Task 3
- Produces: aksi kres memakai `key` huruf besar (`'T'`). Digit tetap (`'9'`). Aksi `Shift` memakai `key: 'Shift'`. `up` memakai string yang sama dengan `down`-nya.

Aturan (spec bagian 4): di tiap titik waktu, natural ditekan lebih dulu, lalu `Shift down` dan kres `down`. `Shift up` terjadi 40 ms setelah kres terakhir di jendela itu. Kres yang datang saat jendela masih terbuka memakai Shift yang sama dan memperpanjang jendela. Natural yang datang saat jendela terbuka dimundurkan ke saat `Shift up`.

- [ ] **Step 1: Tambahkan tes yang gagal** (di akhir `test/schedule.test.ts`)

```ts
test('mixed chord: natural first, then Shift + sharp, Shift released after 40 ms', () => {
  assert.deepEqual(rows('RH: [C#4 E4]'), [
    [0, 'down', 'u'], [0, 'down', 'Shift'], [0, 'down', 'T'],
    [40, 'up', 'Shift'],
    [970, 'up', 'T'], [970, 'up', 'u'],
  ]);
});

test('natural inside the Shift window is delayed until Shift is up', () => {
  assert.deepEqual(rows('RH: C#4\nLH: R:0.02 C3'), [
    [0, 'down', 'Shift'], [0, 'down', 'T'],
    [40, 'up', 'Shift'], [40, 'down', '8'],
    [970, 'up', 'T'], [990, 'up', '8'],
  ]);
});

test('sharp inside the Shift window reuses Shift and extends it', () => {
  assert.deepEqual(rows('RH: C#4\nLH: R:0.02 D#3'), [
    [0, 'down', 'Shift'], [0, 'down', 'T'],
    [20, 'down', '9'],
    [60, 'up', 'Shift'],
    [970, 'up', 'T'], [990, 'up', '9'],
  ]);
});

test('sharps far apart get separate Shift presses', () => {
  assert.deepEqual(rows('RH: C#4 D#4'), [
    [0, 'down', 'Shift'], [0, 'down', 'T'], [40, 'up', 'Shift'],
    [970, 'up', 'T'],
    [1000, 'down', 'Shift'], [1000, 'down', 'Y'], [1040, 'up', 'Shift'],
    [1970, 'up', 'Y'],
  ]);
});

test('a delayed very short note is still held at least 20 ms', () => {
  assert.deepEqual(rows('RH: C#4\nLH: R:0.02 C3:0.01'), [
    [0, 'down', 'Shift'], [0, 'down', 'T'],
    [40, 'up', 'Shift'], [40, 'down', '8'],
    [60, 'up', '8'],
    [970, 'up', 'T'],
  ]);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm test`
Expected: FAIL pada 5 tes baru (tidak ada aksi `Shift`, kres memakai `'t'`). Tes lama tetap lulus.

- [ ] **Step 3: Implementasi**: ganti seluruh fungsi `toActions` di `src/schedule.ts` dengan:

```ts
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
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm test`
Expected: PASS, semua tes (7 + 5 schedule).

- [ ] **Step 5: Commit**

```bash
git add src/schedule.ts test/schedule.test.ts
git commit -m "feat: shift handling for sharps (Unity samples Shift per frame)"
```

---

### Task 5: Schedule, deteksi bentrok tombol

**Files:**
- Modify: `src/schedule.ts` (fungsi `schedule` dan fungsi baru `findKeyClashes`)
- Test: `test/schedule.test.ts`

**Interfaces:**
- Consumes: `layout`, `toActions`, `Sounding` dari Task 3-4; `formatError` dari notation (tes)
- Produces: `schedule()` mengembalikan `{ actions: [], errors }` bila ada bentrok. Pesan: `bentrok tombol: <not A> (baris <a>) dan <not B> (baris <b>) memakai tombol yang sama pada waktu bersamaan`, dengan `line` = baris not kedua. Error diurutkan per baris.

- [ ] **Step 1: Tambahkan tes yang gagal**

Tambahkan `formatError` ke import notation di bagian atas file: `import { parse, formatError } from '../src/notation.ts';`, lalu di akhir file:

```ts
function clashes(body: string) {
  const parsed = parse('tempo: 60\n' + body);
  assert.deepEqual(parsed.errors, []);
  const result = schedule(parsed.song);
  return { actions: result.actions, errors: result.errors.map(formatError) };
}

test('C4 and C#4 overlapping share key t', () => {
  assert.deepEqual(clashes('RH: C4:2\nLH: R C#4'), {
    actions: [],
    errors: ['baris 3: bentrok tombol: C4 (baris 2) dan C#4 (baris 3) memakai tombol yang sama pada waktu bersamaan'],
  });
});

test('same note in both hands at the same time', () => {
  assert.deepEqual(clashes('RH: E4\nLH: E4').errors, [
    'baris 3: bentrok tombol: E4 (baris 2) dan E4 (baris 3) memakai tombol yang sama pada waktu bersamaan',
  ]);
});

test('back-to-back notes on the same key do not clash', () => {
  assert.deepEqual(clashes('RH: C4 C#4').errors, []);
  assert.deepEqual(clashes('RH: C4\n\nLH: C#4').errors, []);
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm test`
Expected: FAIL pada 2 tes pertama (`errors` kosong). Tes ketiga lulus.

- [ ] **Step 3: Implementasi**: ganti fungsi `schedule` dan tambahkan `findKeyClashes` di `src/schedule.ts`:

```ts
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
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm test`
Expected: PASS, semua tes.

- [ ] **Step 5: Commit**

```bash
git add src/schedule.ts test/schedule.test.ts
git commit -m "feat: reject notes that need the same key at the same time"
```

---

### Task 6: Lagu contoh domain publik

**Files:**
- Create: `test/songs.test.ts`, `songs/ode-to-joy.txt`, `songs/twinkle.txt`, `songs/uji-kres.txt`

**Interfaces:**
- Consumes: `parse`, `formatError`, `schedule`
- Produces: tiga file lagu yang valid, dipakai `scripts/smoke.ts` (Task 7) dan untuk verifikasi manual.

- [ ] **Step 1: Tulis tes yang gagal** (`test/songs.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parse, formatError } from '../src/notation.ts';
import { schedule } from '../src/schedule.ts';

test('every bundled song parses and schedules without errors', () => {
  const dir = new URL('../songs/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt'));
  assert.ok(files.length >= 3, `expected at least 3 songs, found ${files.length}`);
  for (const f of files) {
    const parsed = parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.deepEqual(parsed.errors.map(formatError), [], f);
    const result = schedule(parsed.song);
    assert.deepEqual(result.errors.map(formatError), [], f);
    assert.ok(result.actions.length > 0, f);
  }
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm test`
Expected: FAIL, `ENOENT ... songs` (folder belum ada).

- [ ] **Step 3: Tulis lagu**

`songs/ode-to-joy.txt`:
```
tempo: 100
# Ode to Joy - Beethoven (domain publik)

RH: E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2
LH: C3:4 | G2:4 | C3:4 | G2:4

RH: E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2
LH: C3:4 | G2:4 | C3:4 | G2:2 [C3 G3]:2
```

`songs/twinkle.txt`:
```
tempo: 100
# Twinkle Twinkle Little Star (domain publik)

RH: C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2
LH: C3:4 | F3:2 C3:2 | F3:2 C3:2 | G2:2 C3:2

RH: G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2
LH: C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2

RH: C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2
LH: C3:4 | F3:2 C3:2 | F3:2 C3:2 | G2:2 C3:2
```

`songs/uji-kres.txt`:
```
tempo: 80
# Uji manual aturan Shift: akord campuran kres + natural, lalu tangga nada kromatik.
# Yang diharapkan terlihat: tiap akord menyalakan 3 tuts sekaligus, lalu 12 tuts berurutan naik.

RH: [C#4 E4 G#4]:2 [D4 F#4 A4]:2 [E4 G#4 B4]:2
LH: A2:2 B2:2 E3:2

RH: C4:0.5 C#4:0.5 D4:0.5 D#4:0.5 E4:0.5 F4:0.5 F#4:0.5 G4:0.5 G#4:0.5 A4:0.5 A#4:0.5 B4:0.5 C5:2
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm test`
Expected: PASS, semua tes.

- [ ] **Step 5: Commit**

```bash
git add songs test/songs.test.ts
git commit -m "feat: public-domain sample songs and a sharp-handling test song"
```

---

### Task 7: Player (Playwright) + smoke script

**Files:**
- Create: `src/player.ts`, `scripts/smoke.ts`

**Interfaces:**
- Consumes: `Action` (schedule, `import type`)
- Produces:
  ```ts
  export type PlayerState = 'loading' | 'ready' | 'playing' | 'done' | 'stopped' | 'error';
  export interface PlayerStatus { state: PlayerState; message?: string }
  export interface Player {
    status(): PlayerStatus;
    play(actions: Action[]): Promise<void>; // menghentikan pemutaran sebelumnya; resolve saat selesai atau dibatalkan; tidak pernah reject
    stop(): Promise<void>;                  // melepas semua tombol yang ditahan, termasuk Shift
  }
  export class PianoPlayer implements Player {
    ensureReady(): Promise<void>; // membuka Chromium + memuat piano bila belum ada; reject bila gagal (status 'error')
    close(): Promise<void>;
  }
  ```

Bagian ini bergantung pada situs nyata, jadi tidak ada tes otomatis. Verifikasi dilakukan manual lewat smoke script.

- [ ] **Step 1: Implementasi** (`src/player.ts`)

```ts
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
      for (const action of actions) {
        // Absolute clock: a late action does not push back the ones after it.
        const wait = action.at - (performance.now() - t0);
        if (wait > 0) await sleep(wait);
        if (run !== this.runId) return;
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
        this.browser = await chromium.launch({ headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
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
```

- [ ] **Step 2: Smoke script** (`scripts/smoke.ts`)

```ts
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
```

- [ ] **Step 3: Pastikan tes lama tetap lulus**

Run: `npm test`
Expected: PASS, semua tes (player tidak diimpor oleh tes).

- [ ] **Step 4: Verifikasi manual (oleh pengguna)**

Run: `npm run smoke`
Expected: Chromium terbuka, piano dimuat sekitar 15 detik, lalu tiga akord masing-masing menyalakan 3 tuts (termasuk tuts hitam). Setelah itu 12 tuts berurutan naik dari C4 ke B4, lalu C5. Terakhir tercetak `Status akhir: { state: 'done' }` dan Chromium tertutup.

Run: `npm run smoke songs/ode-to-joy.txt`
Expected: melodi Ode to Joy terdengar dengan bas di tangan kiri.

- [ ] **Step 5: Commit**

```bash
git add src/player.ts scripts/smoke.ts
git commit -m "feat: Playwright player driving the Unity piano"
```

---

### Task 8: Server + panel + titik masuk

**Files:**
- Create: `src/server.ts`, `src/main.ts`, `public/panel.html`, `test/server.test.ts`

**Interfaces:**
- Consumes: `parse`, `formatError` (notation); `schedule`, `Action` (schedule); `Player`, `PlayerStatus` (player, `import type`); `PianoPlayer` (hanya di `main.ts`)
- Produces: `export function createApp(player: Player, panelPath: string): Server` (`Server` dari `node:http`). Rute: `GET /`, `GET /status`, `POST /play` `{ text, speed }` (speed berupa rasio 0.5-2), `POST /stop`, dan 404 untuk rute lain.

- [ ] **Step 1: Tulis tes yang gagal** (`test/server.test.ts`)

```ts
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
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../src/server.ts'`.

- [ ] **Step 3: Implementasi server** (`src/server.ts`)

```ts
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
```

- [ ] **Step 4: Panel** (`public/panel.html`)

```html
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Piano Autoplay</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 24px auto; padding: 0 16px; color: #1d1d1f; background: #fafafa; }
  textarea { width: 100%; box-sizing: border-box; height: 360px; font: 14px/1.5 ui-monospace, Consolas, monospace; padding: 8px; }
  .row { display: flex; gap: 12px; align-items: center; margin: 12px 0; flex-wrap: wrap; }
  button { padding: 8px 20px; font-size: 15px; cursor: pointer; }
  #status { font-weight: 600; }
  #errors { color: #b00020; font: 13px/1.5 ui-monospace, Consolas, monospace; padding-left: 20px; }
</style>
</head>
<body>
<h1>Piano Autoplay</h1>
<textarea id="text" spellcheck="false" placeholder="tempo: 90&#10;RH: C4 D4 E4&#10;LH: C3:3"></textarea>
<div class="row">
  <label>Kecepatan <input id="speed" type="range" min="50" max="200" step="5" value="100"> <span id="speedLabel">100%</span></label>
  <button id="play">Play</button>
  <button id="stop">Stop</button>
  <span id="status"></span>
</div>
<ul id="errors"></ul>
<script>
const $ = (id) => document.getElementById(id);
const LABELS = { loading: 'Memuat piano...', ready: 'Siap', playing: 'Memainkan...', done: 'Selesai', stopped: 'Berhenti', error: 'Error' };
const STORE_KEY = 'piano-autoplay:text';

try { $('text').value = localStorage.getItem(STORE_KEY) ?? ''; } catch {}
$('text').addEventListener('input', () => { try { localStorage.setItem(STORE_KEY, $('text').value); } catch {} });
$('speed').addEventListener('input', () => { $('speedLabel').textContent = $('speed').value + '%'; });

function showErrors(list) {
  $('errors').replaceChildren(...list.map((m) => { const li = document.createElement('li'); li.textContent = m; return li; }));
}

// After Play, keep polling through 'loading'/'ready' until the run finishes.
let pollTimer = null;
async function refreshStatus(untilFinished = false) {
  clearTimeout(pollTimer);
  try {
    const s = await (await fetch('/status')).json();
    $('status').textContent = LABELS[s.state] + (s.message ? ': ' + s.message : '');
    const settled = untilFinished ? ['done', 'stopped', 'error'] : ['ready', 'done', 'stopped', 'error'];
    if (!settled.includes(s.state)) pollTimer = setTimeout(() => refreshStatus(untilFinished), 500);
  } catch {
    $('status').textContent = 'Server tidak terhubung';
  }
}

$('play').addEventListener('click', async () => {
  showErrors([]);
  const res = await fetch('/play', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: $('text').value, speed: Number($('speed').value) / 100 }),
  });
  const body = await res.json();
  if (!res.ok) { showErrors(body.errors ?? ['Gagal memulai']); return; }
  refreshStatus(true);
});

$('stop').addEventListener('click', async () => {
  await fetch('/stop', { method: 'POST' });
  refreshStatus();
});

refreshStatus();
</script>
</body>
</html>
```

- [ ] **Step 5: Titik masuk** (`src/main.ts`)

```ts
import { fileURLToPath } from 'node:url';
import { createApp } from './server.ts';
import { PianoPlayer } from './player.ts';

const PORT = 5178;
const player = new PianoPlayer();
player.ensureReady().catch(() => {}); // status shows the error; next Play retries

const server = createApp(player, fileURLToPath(new URL('../public/panel.html', import.meta.url)));
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Panel: http://127.0.0.1:${PORT}`);
});

process.on('SIGINT', async () => {
  await player.stop();
  await player.close();
  process.exit(0);
});
```

- [ ] **Step 6: Jalankan tes, pastikan lulus**

Run: `npm test`
Expected: PASS, semua tes termasuk 8 tes server.

- [ ] **Step 7: Verifikasi manual (oleh pengguna)**

Run: `npm start`, lalu buka http://127.0.0.1:5178
Expected:
1. Chromium terbuka sendiri dan status panel berubah dari `Memuat piano...` ke `Siap`.
2. Tempel isi `songs/twinkle.txt`, lalu klik Play. Status menjadi `Memainkan...`, tuts ditekan dan berbunyi, lalu status menjadi `Selesai`.
3. Klik Play lagi, lalu Stop di tengah lagu. Suara langsung berhenti, tidak ada tuts yang tertahan, dan status menjadi `Berhenti`.
4. Tulis `RH: A1`, lalu klik Play. Muncul error merah `baris 1: A1 di luar jangkauan piano (C2-C7)` dan piano tidak bergerak.
5. Geser kecepatan ke 50%, lalu Play. Lagu terdengar dua kali lebih lambat.
6. Refresh panel. Teks notasi masih ada.
7. Tutup jendela Chromium, lalu klik Play. Chromium terbuka lagi, piano dimuat, lalu lagu dimainkan.

- [ ] **Step 8: Commit**

```bash
git add src/server.ts src/main.ts public/panel.html test/server.test.ts
git commit -m "feat: local panel and HTTP API to play notation"
```
