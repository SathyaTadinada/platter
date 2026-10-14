// The demo's fetch, registered when the demo code loads (it's kept out of the main bundle)
let demoFetch: typeof fetch | null = null

export const setDemoFetch = (f: typeof fetch) => {
  demoFetch = f
}
export const getDemoFetch = () => demoFetch
