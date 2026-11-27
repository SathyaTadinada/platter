// Last.fm signs every call with an MD5 of its parameters and the app's secret, so the secret stays here.
// Like Discogs, the Worker only signs: the browser sends the call to Last.fm and gets the reply.

// The calls Platter makes that need signing. Anything else is turned down.
export const LASTFM_METHODS = new Set(['auth.getSession', 'track.scrobble'])
const MAX_PARAMS = 400 // 50 scrobbles of a few fields each, plus the call's own
const MAX_VALUE = 1000

// Plain string params, a method Platter uses, and nothing huge
export function validLastfmParams(x: unknown): x is Record<string, string> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const entries = Object.entries(x)
  if (entries.length > MAX_PARAMS) return false
  if (!entries.every(([k, v]) => typeof v === 'string' && k.length <= 40 && v.length <= MAX_VALUE)) return false
  const p = x as Record<string, string>
  if (!LASTFM_METHODS.has(p.method)) return false
  // getSession needs the token from the sign-in, everything else a session
  return p.method === 'auth.getSession' ? Boolean(p.token) : Boolean(p.sk)
}

// Every param but format and callback, sorted by name, each name then its value, then the secret
export function lastfmSig(params: Record<string, string>, secret: string): string {
  const text = Object.keys(params)
    .filter((k) => k !== 'format' && k !== 'callback')
    .sort()
    .map((k) => k + params[k])
    .join('')
  return md5(text + secret)
}

// MD5 of a string's UTF-8 bytes, as hex. Web Crypto in the Worker has it, but not in Node, where the
// tests run, so it's here in full.
export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const words = new Uint32Array((((bytes.length + 8) >> 6) + 1) * 16)
  bytes.forEach((b, i) => (words[i >> 2] |= b << ((i % 4) * 8)))
  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8)
  words[words.length - 2] = bytes.length * 8
  words[words.length - 1] = Math.floor(bytes.length / 0x20000000)

  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  for (let block = 0; block < words.length; block += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0]
    for (let i = 0; i < 64; i++) {
      const round = i >> 4
      const [f, g] =
        round === 0
          ? [(b & c) | (~b & d), i]
          : round === 1
            ? [(d & b) | (~d & c), (5 * i + 1) % 16]
            : round === 2
              ? [b ^ c ^ d, (3 * i + 5) % 16]
              : [c ^ (b | ~d), (7 * i) % 16]
      const s = S[round * 4 + (i % 4)]
      const sum = (a + f + K[i] + words[block + g]) >>> 0
      ;[a, d, c] = [d, c, b]
      b = (b + ((sum << s) | (sum >>> (32 - s)))) >>> 0
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }
  return [a0, b0, c0, d0].map((w) => [0, 8, 16, 24].map((s) => ((w >>> s) & 0xff).toString(16).padStart(2, '0')).join('')).join('')
}
