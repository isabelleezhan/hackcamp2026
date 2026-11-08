/** Memory only: private responses never go into browser storage. */
export class RequestCache {
  private entries = new Map<string, { value: unknown; expires: number }>()
  private pending = new Map<string, Promise<unknown>>()
  private generation = 0

  clear() {
    this.generation += 1
    this.entries.clear()
    this.pending.clear()
  }

  async load<T>(key: string, fetcher: () => Promise<T>, refresh = false): Promise<T> {
    const cached = this.entries.get(key)
    if (!refresh && cached && cached.expires > Date.now()) return structuredClone(cached.value) as T
    this.entries.delete(key)
    const existing = this.pending.get(key)
    if (!refresh && existing) return structuredClone(await existing) as T

    const generation = this.generation
    const request = fetcher().then((value) => {
      // A write or account change must not let an older request repopulate the cache.
      // Unfinished editions stay live so their polling never reads a cached status.
      const status = (value as { status?: string } | null)?.status
      if (generation === this.generation && this.pending.get(key) === request &&
          !['pending', 'generating', 'failed'].includes(status ?? '')) {
        if (this.entries.size >= 128) this.entries.delete(this.entries.keys().next().value!)
        this.entries.set(key, { value: structuredClone(value), expires: Date.now() + 30_000 })
      }
      return value
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key)
    })
    this.pending.set(key, request)
    return structuredClone(await request)
  }
}
