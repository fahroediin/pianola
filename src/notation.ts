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
