export type Identity = { username: string; id: number }
export type SignableRequest = { method: string; url: string }

// Everything outside src/auth talks to this, never to tokens directly.
export interface Auth {
  readonly kind: 'token' | 'oauth' | 'demo'
  getAuthHeaders(req: SignableRequest): Promise<Record<string, string>>
  // Signs requests that are about to be made, in one go, so each doesn't need its own trip to the
  // Worker. Only does anything for a Discogs login.
  prepare(reqs: SignableRequest[]): Promise<void>
  getIdentity(): Identity
  signOut(opts?: { everything?: boolean }): Promise<void>
}
