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
