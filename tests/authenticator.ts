import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'

// A passkey made in software, answering registration and sign-in the way a browser would, so the
// Worker's real verification runs in tests

const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url')
const sha = (b: Uint8Array | string) => new Uint8Array(createHash('sha256').update(b).digest())
const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts))

// just enough CBOR for an attestation object and a public key
type Cbor = number | string | Uint8Array | Map<number | string, Cbor>
function head(major: number, n: number): Uint8Array {
  if (n < 24) return new Uint8Array([(major << 5) | n])
  if (n < 256) return new Uint8Array([(major << 5) | 24, n])
  return new Uint8Array([(major << 5) | 25, n >> 8, n & 255])
}
function cbor(v: Cbor): Uint8Array {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v)
  if (typeof v === 'string') {
    const b = new TextEncoder().encode(v)
    return concat(head(3, b.length), b)
  }
  if (v instanceof Uint8Array) return concat(head(2, v.length), v)
  return concat(head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)]))
}

type Options = { challenge: string; rp?: { id?: string }; rpId?: string; user?: { id: string } }

export class Authenticator {
  readonly credentialId = new Uint8Array(randomBytes(16))
  private key: KeyObject
  private publicKey: KeyObject
  private counter = 0
  private userHandle = ''

  constructor(private origin: string) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    this.key = privateKey
    this.publicKey = publicKey
  }

  get id() {
    return b64url(this.credentialId)
  }

  private clientData(type: string, challenge: string) {
    return new TextEncoder().encode(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }))
  }

  register(options: Options) {
    this.userHandle = options.user!.id
    const jwk = this.publicKey.export({ format: 'jwk' })
    const cose = cbor(
      new Map<number, Cbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))],
        [-3, new Uint8Array(Buffer.from(jwk.y!, 'base64url'))],
      ]),
    )
    const idLength = new Uint8Array([this.credentialId.length >> 8, this.credentialId.length & 255])
    // user present, user verified, attested credential data included
    const authData = concat(sha(options.rp!.id!), new Uint8Array([0x45, 0, 0, 0, 0]), new Uint8Array(16), idLength, this.credentialId, cose)
    const attestation = cbor(
      new Map<string, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    )
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(this.clientData('webauthn.create', options.challenge)),
        attestationObject: b64url(attestation),
        transports: ['internal'],
      },
    }
  }

  signIn(options: Options) {
    this.counter++
    const count = new Uint8Array([0, 0, 0, this.counter])
    const authData = concat(sha(options.rpId!), new Uint8Array([0x05]), count)
    const clientData = this.clientData('webauthn.get', options.challenge)
    const signature = sign('sha256', concat(authData, sha(clientData)), { key: this.key, dsaEncoding: 'der' })
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(clientData),
        authenticatorData: b64url(authData),
        signature: b64url(new Uint8Array(signature)),
        userHandle: this.userHandle,
      },
    }
  }
}
