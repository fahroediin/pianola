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
