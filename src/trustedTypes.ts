// The CSP requires Trusted Types. This default policy lets same-origin script
// URLs through (the service worker) and refuses raw HTML or script strings.
type Policy = { createScriptURL: (s: string) => string; createHTML: (s: string) => string; createScript: (s: string) => string }
type TT = { createPolicy: (name: string, p: Policy) => unknown }

const tt = (window as unknown as { trustedTypes?: TT }).trustedTypes
if (tt) {
  const refuse = () => {
    throw new TypeError('Blocked by Trusted Types policy')
  }
  tt.createPolicy('default', {
    createScriptURL: (s) => {
      if (new URL(s, location.href).origin !== location.origin) refuse()
      return s
    },
    createHTML: refuse,
    createScript: refuse,
  })
}
