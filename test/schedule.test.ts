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
