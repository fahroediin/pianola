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
