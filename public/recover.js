// If the app script fails to load, the page is usually stale from before an
// update and points at files that no longer exist. Reload to fix it.
window.addEventListener(
  'error',
  function (e) {
    var t = e.target
    // only our own bundle; scripts Cloudflare injects (and the CSP blocks) fire errors too
    if (!t || t.tagName !== 'SCRIPT' || (t.src || '').indexOf(location.origin + '/assets/') !== 0) return
    try {
      // at most once a minute, so this can never turn into a reload loop
      var last = Number(sessionStorage.getItem('platter.reloadedAt') || 0)
      if (Date.now() - last < 60000) return
      sessionStorage.setItem('platter.reloadedAt', String(Date.now()))
    } catch (_) {
      return
    }
    location.reload()
  },
  true,
)
