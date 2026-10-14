import { saveSession } from '../auth/auth'
import { db, type Session } from '../db/db'
import { localDate, type ValueSnapshot } from '../lib/value'
import { createDemoFetch, currentDemoPlays, currentDemoValue, DEMO_USER, resetDemo } from './backend'
import { setDemoFetch } from './registry'

setDemoFetch(createDemoFetch())

// A few weeks of made-up readings so the value chart has something to show
async function seedValueHistory(now = Date.now()) {
  const day = 24 * 60 * 60 * 1000
  const today = await currentDemoValue()
  const rows: ValueSnapshot[] = []
  for (let i = 42; i >= 1; i -= 3) {
    const median = today * (1 - i / 300) + Math.sin(i / 3) * 18
    rows.push({
      date: localDate(now - i * day),
      at: now - i * day,
      currency: 'USD',
      min: median * 0.55,
      median,
      max: median * 1.6,
      count: 40,
    })
  }
  await db.valueHistory.bulkPut(rows)
}

export async function enterDemo(): Promise<Session> {
  // start from the sample collection again, even if a demo ran earlier in this tab
  resetDemo()
  await seedValueHistory()
  await db.plays.bulkAdd(await currentDemoPlays())
  return saveSession({ kind: 'demo', token: '', username: DEMO_USER, userId: 0 })
}
