import assert from 'node:assert/strict'
import { test } from 'node:test'
import { periodCountdownLabel, timeUntil } from '../src/lib/time.ts'

const cutoff = '2026-11-09T07:59:00Z'
const period = { deadline_at: cutoff, closed_at: null }

test('a future cutoff never shows zero minutes', () => {
  const before = Date.parse(cutoff) - 1000
  assert.equal(timeUntil(cutoff, before), '1 min')
  assert.equal(periodCountdownLabel(period, before), 'Closes in 1 min')
})

test('the cutoff and overdue periods show a closed state while the worker catches up', () => {
  for (const delay of [0, 60_000, 180_000]) {
    assert.equal(periodCountdownLabel(period, Date.parse(cutoff) + delay), 'Notes closed · awaiting publication')
  }
})

test('a new server period resets the countdown instead of reusing an expired cutoff', () => {
  const next = { deadline_at: '2026-11-11T07:59:00Z', closed_at: null }
  assert.equal(periodCountdownLabel(next, Date.parse(cutoff)), 'Closes in 2 days 0 hr')
})

test('an early closed period cannot appear open just because its deadline is in the future', () => {
  assert.equal(periodCountdownLabel({ ...period, closed_at: '2026-11-08T12:00:00Z' }, Date.parse('2026-11-08T12:00:00Z')), 'Notes closed · awaiting publication')
})
