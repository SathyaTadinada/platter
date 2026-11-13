import { describe, expect, it } from 'vitest'
import { deviceName } from './deviceName'

describe('deviceName', () => {
  it('names common browsers', () => {
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    const windows =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
    const android = 'Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0'
    expect(deviceName(iphone, true)).toBe('Safari on iPhone')
    expect(deviceName(mac, false)).toBe('Chrome on Mac')
    expect(deviceName(ipad, true)).toBe('Safari on iPad')
    expect(deviceName(ipad, false)).toBe('Safari on Mac')
    expect(deviceName(windows, false)).toBe('Edge on Windows')
    expect(deviceName(android, true)).toBe('Firefox on Android')
    expect(deviceName('curl/8', false)).toBe('Browser')
  })
})
