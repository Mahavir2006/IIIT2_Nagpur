# Deploying PRAVAAH

PRAVAAH has **no backend**. The flood solver runs in the browser (Web Worker), all
scenario data is static files in `public/`, and the only external calls are public
tile servers (Esri imagery, AWS Terrain Tiles) that need no API key. `next build`
produces a fully static site, so one Vercel project is the whole deployment.

## Vercel (Git integration, recommended)

1. vercel.com → **Add New… → Project** → import `Mahavir2006/yekyahai`.
2. **Root Directory: `webapp`** (required — the repo root holds the older prototype).
3. Framework preset: Next.js (auto-detected; `vercel.json` pins install/build commands).
4. No environment variables are needed. Click **Deploy**.

Every push to `main` then deploys to production; other branches get preview URLs.

## Vercel (CLI, from this folder)

```bash
npm run deploy:preview   # first run links the project; answer "webapp" as the root
npm run deploy           # production
```

## Before a demo

- The first visit on a cold cache downloads terrain and imagery tiles (10–30 s).
- `npm run build` locally must pass before pushing; Vercel runs the same build.

## Railway

Not needed today — there is nothing server-side to run. Add a Railway service only if
a server component is introduced later (e.g. a scheduled Sentinel-1 / Earth Engine
job, saved runs, or user accounts). The frontend would then read its URL from a
`NEXT_PUBLIC_API_URL` environment variable set in Vercel.
