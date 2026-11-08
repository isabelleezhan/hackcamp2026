import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RequestCache } from '../src/lib/requestCache.ts'

test('return visits reuse responses without sharing mutable objects', async () => {
  const cache = new RequestCache()
  let calls = 0
  const load = () => cache.load('group', async () => ({ name: `Group ${++calls}` }))
  const first = await load()
  first.name = 'Changed locally'
  assert.deepEqual(await load(), { name: 'Group 1' })
  assert.equal(calls, 1)
})

test('concurrent readers share a request but receive independent objects', async () => {
  const cache = new RequestCache()
  let calls = 0
  const load = () => cache.load('group', async () => ({ calls: ++calls }))
  const [a, b] = await Promise.all([load(), load()])
  assert.deepEqual(a, b)
  assert.notEqual(a, b)
  assert.equal(calls, 1)
})

test('responses expire after thirty seconds', async (t) => {
  const cache = new RequestCache()
  let now = 0
  t.mock.method(Date, 'now', () => now)
  let calls = 0
  const load = () => cache.load('group', async () => ++calls)
  assert.equal(await load(), 1)
  now = 29_999
  assert.equal(await load(), 1)
  now = 30_000
  assert.equal(await load(), 2)
})

test('clearing blocks late responses from repopulating cache after writes or sign-out', async () => {
  const cache = new RequestCache()
  let finish
  const old = cache.load('group', () => new Promise((resolve) => { finish = resolve }))
  cache.clear()
  assert.equal(await cache.load('group', async () => 'new'), 'new')
  finish('old')
  await old
  assert.equal(await cache.load('group', async () => 'unexpected'), 'new')
})

test('forced refresh supersedes an older request', async () => {
  const cache = new RequestCache()
  let finish
  const old = cache.load('group', () => new Promise((resolve) => { finish = resolve }))
  assert.equal(await cache.load('group', async () => 'fresh', true), 'fresh')
  finish('old')
  await old
  assert.equal(await cache.load('group', async () => 'unexpected'), 'fresh')
})

test('failed requests are retried rather than cached', async () => {
  const cache = new RequestCache()
  await assert.rejects(cache.load('group', async () => { throw new Error('offline') }))
  assert.equal(await cache.load('group', async () => 'recovered'), 'recovered')
})

test('unfinished editions stay fresh for polling; published editions are cached', async () => {
  const cache = new RequestCache()
  for (const status of ['pending', 'generating', 'failed', 'published']) {
    assert.deepEqual(await cache.load('edition', async () => ({ status })), { status })
  }
  assert.deepEqual(await cache.load('edition', async () => ({ status: 'unexpected' })), { status: 'published' })
})

test('account and request keys stay separate', async () => {
  const cache = new RequestCache()
  await cache.load('account-a:/groups', async () => ['private A'])
  assert.deepEqual(await cache.load('account-b:/groups', async () => ['private B']), ['private B'])
})

test('cache evicts old entries to bound memory', async () => {
  const cache = new RequestCache()
  for (let i = 0; i < 129; i++) await cache.load(String(i), async () => i)
  assert.equal(await cache.load('0', async () => 'refetched'), 'refetched')
})
