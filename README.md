# แคลกูเอง

Mobile-first calorie, macro, activity and body-measurement tracker. App data is stored in browser Local Storage. Food text is sent to the server only when the user explicitly asks AI to estimate nutrition; the OpenTyphoon API key stays server-side.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_GOOGLE_CLIENT_ID` and `OPENTYPHOON_API_KEY`.
3. Run `npm install` (or `npm ci` from a clean checkout).
4. Run `npm run dev`. Use Vite rather than a static file server because `/api/estimate-food` is provided by the Vite dev middleware locally.
5. Verify with `npm test` and `npm run build`.

## Production deployment on Vercel

The repository is ready for Vercel: the production AI endpoint is `api/estimate-food.js`, while `vercel.json` keeps SPA routing and prevents stale service-worker updates.

1. Import the repository into Vercel and use the Vite defaults.
2. In Project Settings -> Environment Variables, add `OPENTYPHOON_API_KEY` as a server secret and `VITE_GOOGLE_CLIENT_ID` as the browser Google client ID. Add them to the Production environment (and Preview if desired).
3. Deploy, then use the final HTTPS Vercel/custom domain for the Google configuration below.
4. Redeploy whenever a `VITE_` variable changes because Vite injects it at build time.

Actual deployment cannot be performed from the source tree alone; it needs access to the target Vercel project/account and its secrets.

## Google OAuth / Google Identity Services

This app currently uses Google Identity Services credential callback mode (`google.accounts.id`) rather than an OAuth redirect callback route. In Google Cloud Console -> Credentials -> the Web application client used by `VITE_GOOGLE_CLIENT_ID`:

- Add `http://localhost:5173` to **Authorized JavaScript origins** for local development.
- Add the final production origin, for example `https://your-project.vercel.app`, to **Authorized JavaScript origins**.
- If a custom domain is used, add that exact HTTPS origin too.

Because the current implementation receives the Google ID credential in the browser callback, it does **not** consume an application redirect URL. If the project is later changed to Google redirect/code flow, configure the exact redirect URI in Google Cloud Console at that time and add a matching callback endpoint before enabling redirect mode.

## PWA

The app includes:

- Web app manifest with 192px, 512px and maskable PNG icons.
- Apple touch icon and mobile web-app metadata.
- Service worker with versioned static/runtime caches, old-cache cleanup and offline navigation fallback.
- Install prompt UI where the browser exposes `beforeinstallprompt`.
- iPhone/iPad Add to Home Screen guidance.
- A manifest shortcut for opening the Add Food flow.

The AI endpoint is intentionally never cached by the service worker.

## Data and privacy

Food logs, activities, body measurements, goals and the local Google profile are stored under `kalgueng:` Local Storage keys. “Delete account and data” removes every `kalgueng:` key so future app-owned keys are removed too; unrelated Local Storage keys are preserved.

## Tests

`npm test` compiles the TypeScript unit tests to a temporary CommonJS directory, runs them with Node's built-in test runner, runs server tests, then removes the temporary output. Coverage includes:

- Full calorie + protein + carbs + fat goal acceptance and streak edge cases.
- Activity and body-measurement editing behavior.
- Local Storage deletion scope.
- AI client response validation and rate-limit retry.
- AI server response parsing, transient retry and rate-limit metadata.
