// If the app script fails to load, the page is usually stale from before an
// update and points at files that no longer exist. Reload to fix it.
function reloadOnce() {
  try {
    // at most once a minute, so this can never turn into a reload loop
    var last = Number(sessionStorage.getItem('platter.reloadedAt') || 0)
    if (Date.now() - last < 60000) return
    sessionStorage.setItem('platter.reloadedAt', String(Date.now()))
  } catch (_) {
    return
  }
  location.reload()
}

window.addEventListener(
  'error',
  function (e) {
    var t = e.target
    // only our own bundle; scripts Cloudflare injects (and the CSP blocks) fire errors too
    if (t && t.tagName === 'SCRIPT' && (t.src || '').indexOf(location.origin + '/assets/') === 0) reloadOnce()
  },
  true,
)

// the same for a part of the app loaded later (Vite fires this when an import fails)
window.addEventListener('vite:preloadError', reloadOnce)
