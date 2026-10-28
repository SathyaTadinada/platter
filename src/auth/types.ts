export type Identity = { username: string; id: number }
export type SignableRequest = { method: string; url: string }

// Everything outside src/auth talks to this, never to tokens directly.
export interface Auth {
  readonly kind: 'token' | 'oauth' | 'demo'
  getAuthHeaders(req: SignableRequest): Promise<Record<string, string>>
  getAuthHeadersBatch(reqs: SignableRequest[]): Promise<Record<string, string>[]>
  getIdentity(): Identity
  signOut(opts?: { everything?: boolean }): Promise<void>
}
