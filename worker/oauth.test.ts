import { describe, expect, it } from 'vitest'
import { baseString, hmacSha1, pct, signHmac } from './oauth'

// Known-good example from Twitter's OAuth 1.0a signing docs
const example = {
  method: 'POST',
  url: 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
  consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
  consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
  token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
  tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
  nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
  timestamp: '1318622958',
  extra: [['status', 'Hello Ladies + Gentlemen, a signed OAuth request!']] as [string, string][],
}

describe('oauth', () => {
  it('encodes per RFC 3986', () => {
    expect(pct("Ladies + Gentlemen!*'()")).toBe('Ladies%20%2B%20Gentlemen%21%2A%27%28%29')
  })

  it('builds the base string with query params included', () => {
    const base = baseString('GET', 'https://api.discogs.com/database/search?type=release&barcode=123', [['oauth_token', 't']])
    expect(base).toBe('GET&https%3A%2F%2Fapi.discogs.com%2Fdatabase%2Fsearch&barcode%3D123%26oauth_token%3Dt%26type%3Drelease')
  })

  it('matches the reference signature', async () => {
    const h = await signHmac(example)
    expect(h).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"')
  })

  it('computes HMAC-SHA1', async () => {
    expect(await hmacSha1('key', 'The quick brown fox jumps over the lazy dog')).toBe('3nybhbi3iqa8ino29wqQcBydtNk=')
  })
})
