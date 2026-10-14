// Handles /api/* only. Everything else is served from static assets.

interface Env {
  DISCOGS_CONSUMER_KEY?: string
  DISCOGS_CONSUMER_SECRET?: string
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/health') {
      // reports whether secrets are set, never their values
      return Response.json({
        ok: true,
        consumerKey: Boolean(env.DISCOGS_CONSUMER_KEY),
        consumerSecret: Boolean(env.DISCOGS_CONSUMER_SECRET),
      })
    }
    return new Response('Not found', { status: 404 })
  },
}
