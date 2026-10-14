# Platter

Scan the barcode on a record and add it to your Discogs collection. Platter is a static web app you can install to your home screen. It talks to Discogs straight from your browser, and your Discogs sign-in stays on your device.

Live at [platter.tadinada.com](https://platter.tadinada.com).

## What it does

- Browse your collection: grid or list, search across artist, title, label, genre and your own notes, filter by crate (Discogs folders), format, genre, style, decade, rating or any custom field, sort and shuffle
- Record pages with tracklist, rating, crate and editable custom fields, and a choice of cover from the release's other Discogs photos
- Condition, price, date, store, location and notes set while adding, saved to your custom fields in one go. Without purchase or location fields, those details go into Notes as a readable line instead. In a batch, store, date and location can be set once for every record
- Export any filtered view as a CSV in the same columns Discogs uses
- Scan a barcode with your phone camera, or type a barcode, catalog number, or artist and title
- Shows matching releases with cover, label, catalog number, country, year and format
- Warns if you already own that pressing, notes if you own another pressing of the same album, and flags wantlist hits (with an option to remove them after adding)
- Falls back to MusicBrainz when Discogs doesn't know a barcode
- Tells pressings apart by the runout: type what's etched in the dead wax, or read it from a photo, and candidates are ranked against Discogs' Matrix / Runout data, allowing for lookalike characters (O/0, I/1, S/5, B/8) and partial transcriptions
- Reads catalog numbers off a photo of the spine

Text recognition runs on the device with Tesseract. Its engine and English data are served from Platter's own domain and only downloaded the first time they're used.
- Batch mode: scan one record after another without stopping. Scans wait in an on-device queue that survives reloads and works offline, get looked up in the background, and are added together after a quick review
- Import a Discogs collection export (CSV) into your collection, with crates, conditions, notes and ratings, for moving collections between accounts or sharing them
- Checks which Discogs custom collection fields you have and walks you through adding the rest

## How it works

Everything runs in the browser. There's no database and no user accounts. API calls go directly from the browser to `api.discogs.com`, which allows cross-origin requests.

Two ways to sign in:

- **Log in with Discogs** (OAuth 1.0a). Discogs requires every request to be signed with the app's consumer secret, which can't ship to the browser. A small Cloudflare Worker (`worker/`) holds the secret and signs requests, including the two login steps. The browser sends every signed request to Discogs itself. The Worker never talks to Discogs, which matters because Discogs rate-limits by IP and Cloudflare's outgoing IPs are shared with everyone else's Workers. For the login steps the signature goes in the query string, since Discogs fails the CORS preflight on those two URLs.
- **Personal access token**. Pasted in once, kept in IndexedDB, no Worker involved.

The Worker rate-limits `/api/sign` per signed-in user (and the first login step per IP) using Cloudflare's built-in rate limiting.

Discogs counts rate limits per IP and doesn't expose its rate-limit headers to browsers, so the client throttles itself to 55 requests a minute and backs off on 429s. Cached Discogs data expires after 6 hours, per the Discogs API terms.

## Development

```sh
npm install
npm run dev        # app on http://localhost:5173
npm test           # unit tests, using recorded responses in tests/fixtures
npm run typecheck
```

`npm run dev` serves the app only, so log in with a personal access token locally. The signing route (`/api/sign`) only exists on the deployed Worker.

Open `http://localhost:5173/?demo` to try the UI without a Discogs account. Demo mode signs in a fake user and answers API calls from the test fixtures. It only exists in dev builds.

To re-record test fixtures, put a token in `.env` (see `.env.example`) and run `npm run fixtures`. Your username and collection are replaced with placeholders before anything is written.

## Self-hosting

Platter runs on the Cloudflare Workers free plan.

1. Fork the repo and change the `routes` entry in `wrangler.jsonc` to your own domain, or remove it to use a `workers.dev` address.
2. Update `ALLOWED_ORIGINS` in `worker/index.ts` to match.
3. Register an app at [discogs.com/settings/developers](https://www.discogs.com/settings/developers) with the callback URL `https://<your domain>/auth/callback`.
4. Log in to Cloudflare and store the app's key and secret:

   ```sh
   npx wrangler login
   npx wrangler secret put DISCOGS_CONSUMER_KEY
   npx wrangler secret put DISCOGS_CONSUMER_SECRET
   ```

5. Deploy with `npm run deploy`.

Skip steps 3 and 4 if you only want personal access tokens; the "Log in with Discogs" button won't work, but everything else will.

## License

MIT

This application uses Discogs’ API but is not affiliated with, sponsored or endorsed by Discogs. ‘Discogs’ is a trademark of Zink Media, LLC.
