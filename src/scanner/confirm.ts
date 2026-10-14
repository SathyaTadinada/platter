// Accepts a code once it has been read twice within a short window. Reads
// don't need to be back to back, which matters when only some frames are sharp.
export class ReadConfirmer {
  private hits: { code: string; at: number }[] = []

  constructor(
    private needed = 2,
    private windowMs = 1500,
  ) {}

  push(code: string | null, now: number): string | null {
    this.hits = this.hits.filter((h) => now - h.at < this.windowMs)
    if (!code) return null
    this.hits.push({ code, at: now })
    const count = this.hits.filter((h) => h.code === code).length
    return count >= this.needed ? code : null
  }

  reset() {
    this.hits = []
  }
}
