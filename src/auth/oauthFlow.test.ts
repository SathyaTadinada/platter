import { beforeEach, describe, expect, it } from 'vitest'
import { json, routeFetch } from '../../tests/helpers'
import { finishOAuth, startOAuth } from './oauthFlow'

const signed = { oauth_consumer_key: 'key', oauth_signature: 'a/b+c=', oauth_nonce: 'n' }

beforeEach(() => localStorage.clear())

describe('startOAuth', () => {
  it('signs, asks Discogs for a request token from the browser, and redirects', async () => {
    const { fn, calls } = routeFetch([
      ['/api/sign', () => json({ headers: [], params: [signed] })],
      ['/oauth/request_token', () => new Response('oauth_token=rt&oauth_token_secret=rs&oauth_callback_confirmed=true')],
    ])
    let went = ''
    await startOAuth(fn, (u) => (went = u))
    const body = JSON.parse(calls[0].init!.body as string)
    expect(body.requests[0]).toMatchObject({ method: 'GET', url: 'https://api.discogs.com/oauth/request_token' })
    expect(body.requests[0].oauth.oauth_callback).toMatch(/\/auth\/callback$/)
    // signature travels in the query string, with no auth header
    expect(calls[1].url).toContain('oauth_signature=a%2Fb%2Bc%3D')
    expect(calls[1].init?.headers).toBeUndefined()
    expect(went).toBe('https://www.discogs.com/oauth/authorize?oauth_token=rt')
    expect(JSON.parse(localStorage.getItem('platter.oauthPending')!)).toMatchObject({ token: 'rt', secret: 'rs' })
  })

  it('explains a Discogs 429', async () => {
    const { fn } = routeFetch([
      ['/api/sign', () => json({ headers: [], params: [signed] })],
      ['/oauth/request_token', () => new Response('', { status: 429 })],
    ])
    await expect(startOAuth(fn, () => {})).rejects.toThrow('busy')
  })
})

describe('finishOAuth', () => {
  it('trades the verifier for an access token', async () => {
    localStorage.setItem('platter.oauthPending', JSON.stringify({ token: 'rt', secret: 'rs', at: Date.now() }))
    const { fn, calls } = routeFetch([
      ['/api/sign', () => json({ headers: [], params: [signed] })],
      ['/oauth/access_token', () => new Response('oauth_token=at&oauth_token_secret=as')],
    ])
    expect(await finishOAuth('?oauth_token=rt&oauth_verifier=v', fn)).toEqual({ token: 'at', secret: 'as' })
    expect(JSON.parse(calls[0].init!.body as string)).toMatchObject({
      token: 'rt',
      tokenSecret: 'rs',
      requests: [{ method: 'POST', url: 'https://api.discogs.com/oauth/access_token', oauth: { oauth_verifier: 'v' } }],
    })
    expect(calls[1].init?.method).toBe('POST')
    expect(localStorage.getItem('platter.oauthPending')).toBeNull()
  })

  it('refuses a callback it did not start', async () => {
    localStorage.setItem('platter.oauthPending', JSON.stringify({ token: 'other', secret: 'rs', at: Date.now() }))
    await expect(finishOAuth('?oauth_token=rt&oauth_verifier=v', routeFetch([]).fn)).rejects.toThrow('expired')
  })

  it('reports a cancelled sign-in', async () => {
    await expect(finishOAuth('?denied=rt', routeFetch([]).fn)).rejects.toThrow('cancelled')
  })
})
