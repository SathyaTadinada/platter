import { saveSession } from '../auth/auth'
import type { Session } from '../db/db'
import { createDemoFetch, DEMO_USER } from './backend'
import { setDemoFetch } from './registry'

setDemoFetch(createDemoFetch())

export function enterDemo(): Promise<Session> {
  return saveSession({ kind: 'demo', token: '', username: DEMO_USER, userId: 0 })
}
