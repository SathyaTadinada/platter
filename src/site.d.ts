// Set from wrangler.jsonc at build time (vite.config.ts)
declare const __SITE__: string // the site's origin, or '' if SITE isn't set
declare const __ACCOUNTS__: boolean // a database is bound, so Platter accounts work
declare const __LASTFM__: string // the app's Last.fm API key, or '' when scrobbling to Last.fm is off
