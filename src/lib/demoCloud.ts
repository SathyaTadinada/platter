import type { CloudApi, DeviceInfo, PasskeyInfo } from './cloud'
import { deviceName } from './deviceName'

// The account page in the demo: a couple of devices and a passkey, kept in memory, with nothing sent
export function demoCloudApi(): CloudApi {
  const now = Date.now()
  let devices: DeviceInfo[] = [
    { id: 'this', name: deviceName(), createdAt: now - 40 * 86_400_000, lastSeenAt: now, current: true },
    { id: 'phone', name: 'Safari on iPhone', createdAt: now - 90 * 86_400_000, lastSeenAt: now - 3 * 3_600_000, current: false },
  ]
  let passkeys: PasskeyInfo[] = [
    { id: 'demo', name: 'Safari on iPhone', createdAt: now - 90 * 86_400_000, lastUsedAt: now - 30 * 86_400_000 },
  ]
  let password = false
  const pause = () => new Promise<void>((r) => setTimeout(r, 300))
  const nothing = async () => {
    await pause()
    return {}
  }
  return {
    pull: async () => ({ rows: [], seq: 0, more: false, off: [] }),
    push: async () => ({ seq: 0, seqs: [] }),
    pair: async () => ({ code: 'ABC-DEF', expiresAt: Date.now() + 600_000 }),
    password: async () => {
      await pause()
      password = true
      return {}
    },
    setOff: async (off) => ({ off }),
    leave: nothing,
    forget: nothing,
    account: async () => ({ name: 'demo', discogsId: 1, password, passkeys: passkeys.length, admin: false, badges: [] }),
    link: nothing,
    devices: async () => ({ devices }),
    removeDevice: async (id) => {
      await pause()
      devices = devices.filter((d) => d.id !== id)
      return {}
    },
    passkeyOptions: async () => {
      throw new Error('Not in the demo')
    },
    registerPasskey: async () => {
      throw new Error('Not in the demo')
    },
    passkeys: async () => ({ passkeys }),
    renamePasskey: async (id, name) => {
      passkeys = passkeys.map((p) => (p.id === id ? { ...p, name } : p))
      return {}
    },
    removePasskey: async (id) => {
      await pause()
      passkeys = passkeys.filter((p) => p.id !== id)
      return {}
    },
    members: async () => ({ members: [] }),
    setBadge: async () => ({ badges: [] }),
    clearWaysIn: nothing,
    deleteMember: nothing,
  }
}
