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
