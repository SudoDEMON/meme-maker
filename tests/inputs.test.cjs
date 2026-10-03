'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTimeRange } = require('../server/inputs');

test('blank and omitted time boundaries default independently to the full media range', () => {
  for (const fields of [{}, { start: '', end: '' }, { start: '  ', end: '  ' }]) {
    assert.deepEqual(validateTimeRange(fields), { start: '0:00', end: '' });
  }
  assert.deepEqual(validateTimeRange({ end: '0:37.633' }), { start: '0:00', end: '0:37.633' });
  assert.deepEqual(validateTimeRange({ start: '0:01.25' }), { start: '0:01.25', end: '' });
  assert.deepEqual(validateTimeRange({ end: 'inf' }), { start: '0:00', end: 'inf' });
});

test('defaulted boundaries still reject empty or reversed ranges and malformed times', () => {
  for (const fields of [{ end: '0' }, { start: '2', end: '1' }, { start: '1', end: '1' }, { start: 'invalid' }, { end: '0:60' }]) {
    assert.throws(() => validateTimeRange(fields));
  }
});
