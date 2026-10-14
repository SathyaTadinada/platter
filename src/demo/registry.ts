// The demo's fetch, registered when the demo code loads (it's kept out of the main bundle)
let demoFetch: typeof fetch | null = null

export const setDemoFetch = (f: typeof fetch) => {
  demoFetch = f
}
export const getDemoFetch = () => demoFetch

// Requests the demo answers itself, so they don't count against the rate limit
export const isDemoLocal = (url: string) => /^https:\/\/api\.discogs\.com\/(users\/demo([/?]|$)|oauth\/identity)/.test(url)
