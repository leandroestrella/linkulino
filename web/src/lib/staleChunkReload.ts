// A production deploy publishes a fresh set of content-hashed chunks and the FTP
// sync deletes the previous set (see .github/workflows/deployTocPanel.yml). A tab
// still running an older build — or one that loaded a cached index.html — then
// asks for a lazy route chunk (App.tsx loads every page with import()) whose file
// is gone. The server now answers a missing /assets/ file with a real 404 (see
// web/public/.htaccess), so Vite raises `vite:preloadError`. Reload once to fetch
// the current index.html and its live chunk names; the guard blocks a reload loop
// when a reload cannot fix the failure (the visitor is offline, or the deploy
// itself is broken).

declare global {
  interface Window {
    // Set by the inline analytics snippet in index.html. Optional: the script
    // can be blocked, so callers guard with `?.`.
    posthog?: { capture: (event: string) => void }
  }
}

const RELOAD_GUARD_KEY = 'linkulino:stale-chunk-reloaded'

/** Reloads once when a lazy chunk is unreachable, so a stale client self-heals after a deploy. */
export function installStaleChunkReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return
    // Stop Vite from rethrowing: the reload replaces this document anyway, and an
    // unhandled rejection would only add noise to error tracking.
    event.preventDefault()
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
    // Count the self-heal, so the recovery has a metric of its own separate from
    // the exception it prevents.
    window.posthog?.capture('spa_stale_chunk_reload')
    window.location.reload()
  })

  // Re-arm once the app has stayed up without a preload failure: a later deploy
  // in the same long-lived session then gets its own single reload rather than
  // being suppressed for the whole session. Within 10s of a reload the guard is
  // still set, which is what stops a tight loop.
  window.setTimeout(() => sessionStorage.removeItem(RELOAD_GUARD_KEY), 10_000)
}
