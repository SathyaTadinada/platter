// What this browser calls itself in the account's device list, like "Safari on iPhone"
export function deviceName(ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1): string {
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /Firefox|FxiOS/.test(ua)
      ? 'Firefox'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung Internet'
          : /CriOS|Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Browser'
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) // iPads ask for desktop sites as a Mac
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Macintosh|Mac OS X/.test(ua)
            ? 'Mac'
            : /Windows/.test(ua)
              ? 'Windows'
              : /Linux/.test(ua)
                ? 'Linux'
                : null
  return os ? `${browser} on ${os}` : browser
}
