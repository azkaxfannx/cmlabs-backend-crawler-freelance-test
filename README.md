# cmlabs Backend Crawler — SPA / SSR / PWA Renderer

> Pre-assessment task — Intermediate Back-end Developer (BE-PT-02-3)
> Crawl `https://cmlabs.co`, `https://sequence.day`, and a free-pick site, save the rendered HTML, screenshot, and classification metadata for each.

A small NestJS service that drives a headless Chromium (via Playwright) to render any page — including single-page apps, server-rendered pages, and progressive web apps — and captures the final HTML exactly as a real browser sees it.

---

## Why a real browser

A plain HTTP client (`axios`, `requests`, `curl`) only sees the bytes the origin responds with. That's fine for classic server-rendered sites, but:

- **SPAs** (React / Vue / Svelte) ship an almost-empty `<body>` and fill it with JavaScript on the client. `curl` gets nothing useful.
- **SSR + hydration** frameworks (Next.js App Router, Nuxt, Remix) render once on the server and then hydrate on the client — some content only finalizes after JS runs.
- **PWAs** additionally register a service worker that can change what's displayed. Missing the service worker means missing real behavior.

Playwright ticks all three boxes because it runs a real Chromium, executes JavaScript, and exposes both the page and its service worker registrations. See the [Playwright service workers docs](https://playwright.dev/docs/service-workers-experimental) and [`page.content()`](https://playwright.dev/docs/api/class-page#page-content).

## Stack

| Layer      | Choice                                               | Reason                                                                      |
| ---------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Runtime    | Node.js 20+                                          | One of the languages allowed by the task spec                               |
| Framework  | NestJS 10                                            | Controllers / services / DI / pipes — clean structure for a backend service |
| Renderer   | Playwright 1.49 (Chromium)                           | Handles SPA, SSR, and PWA with one API                                      |
| Validation | class-validator + class-transformer + ValidationPipe | Rejects bad input at the boundary                                           |
| API docs   | `@nestjs/swagger`                                    | Auto-generated OpenAPI UI at `/api/docs`                                    |
| Tests      | Jest + ts-jest                                       | Unit tests on the classification logic                                      |

## Project layout

```
.
├── src/
│   ├── main.ts                      bootstrap + swagger
│   ├── app.module.ts
│   ├── common/
│   │   └── storage.service.ts       disk persistence + slugify
│   └── crawler/
│       ├── crawler.module.ts
│       ├── crawler.controller.ts    POST /crawl, GET /results/:file, GET /health
│       ├── crawler.service.ts       orchestration
│       ├── dto/crawl.dto.ts         input/output DTOs
│       └── engine/
│           ├── renderer.ts          playwright render pipeline
│           ├── detector.ts          SPA / SSR / PWA / HYBRID / STATIC classifier
│           └── scroller.ts          lazy-load trigger
├── scripts/
│   └── crawl-targets.ts             CLI — crawls the 3 assignment targets
├── test/
│   └── detector.spec.ts             5 unit tests on the classifier
├── results/                         output .html + .meta.json + .png
└── README.md
```

## Requirements

- Node.js 20 or newer
- ~350 MB free disk (NestJS deps + bundled Chromium)

## Install

```powershell
npm install
```

`npm install` runs `playwright install chromium` automatically via the `postinstall` hook, so browsers are ready once install finishes.

## Run

### 1. Crawl the three assignment targets in one shot

```powershell
npm run crawl:targets
```

This writes `cmlabs.co.html`, `sequence.day.html`, `web.dev.html` (plus each one's `.meta.json` and `.png` screenshot) into `./results/` and emits a `summary.json`.

### 2. Run as an HTTP API

```powershell
npm run start:dev        # dev mode with reload
# or
npm run build && npm run start:prod
```

Open http://localhost:3000/api/docs for the Swagger UI.

Hit it with curl:

```bash
curl -X POST http://localhost:3000/crawl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://cmlabs.co"}'
```

Response shape:

```json
{
  "success": true,
  "type": "SSR",
  "framework": null,
  "slug": "cmlabs.co",
  "htmlFile": "cmlabs.co.html",
  "screenshotFile": "cmlabs.co.png",
  "meta": {
    "url": "https://cmlabs.co",
    "finalUrl": "https://cmlabs.co/en-id",
    "title": "cmlabs SEO Agency Indonesia: Supervene Search Odyssey",
    "fetchedAt": "2026-04-23T05:43:10.000Z",
    "detection": {
      "kind": "SSR",
      "framework": null,
      "reasoning": ["origin shipped 38412 chars of body text, no SPA markers"]
    },
    "stats": { "requests": 220, "failedRequests": 5, "serviceWorkersSeen": 0, "durationMs": 12710 }
  }
}
```

The saved HTML file is a standalone document — a `<base href="...">` is injected into `<head>` so that relative URLs (images, CSS, fonts) still resolve against the original origin when you open the file locally.

Fetch a saved artifact back:

```
GET http://localhost:3000/results/cmlabs.co.html
GET http://localhost:3000/results/sequence.day.meta.json
GET http://localhost:3000/results/web.dev.png
```

## How the renderer works

For every URL:

1. Launch a Chromium browser context with a realistic user-agent, desktop viewport, and service workers **allowed**.
2. Listen for `request`, `requestfailed`, and `serviceworker` events to build request stats.
3. Capture the raw HTML the origin responded with (before any JS runs) so we can compare "what the server shipped" vs "what the page became".
4. Navigate with `waitUntil: "domcontentloaded"`, then `waitForLoadState("networkidle")` with a 20 s cap — some sites keep long-lived sockets so we tolerate a timeout.
5. Auto-scroll in 600 px steps until the document height stops growing, so `IntersectionObserver` / lazy-load sections actually load.
6. Wait one more short beat for hydration / animations to settle.
7. Grab `page.content()` — that's the final DOM as a real user sees it.
8. Inject `<base href="...">` so the HTML is self-contained when opened from disk.
9. Take a full-page screenshot.
10. Classify and persist.

## Classification rules

`src/crawler/engine/detector.ts`, in order:

1. **PWA** — navigator registered a service worker **and** a `<link rel="manifest">` is present.
2. **SPA** — the origin's raw body text is nearly empty (< 400 chars) **and** the rendered body is rich. Meaning: the client did all the work.
3. **HYBRID** — Next.js / Nuxt / SvelteKit markers are present (including the Next.js App Router signals: `__next_f`, `/_next/static`) **and** the raw body already has content. SSR + client hydration.
4. **SSR** — raw body is already rich but no framework markers. Classic server render.
5. **STATIC** — no strong signals.

Covered by `test/detector.spec.ts`.

## Results from the assignment run

| Target               | Kind   | Framework | Rendered HTML | Notes                                                                |
| -------------------- | ------ | --------- | ------------- | -------------------------------------------------------------------- |
| https://cmlabs.co    | SSR    | —         | ~3.8 MB       | Server-rendered backend, heavy inline content, redirects to `/en-id` |
| https://sequence.day | HYBRID | Next.js   | ~150 KB       | Next.js App Router (`__next_f` detected) — SSR + client hydration    |
| https://web.dev      | PWA    | —         | ~130 KB       | Service worker registered on first visit, manifest present           |

The third site (`web.dev`) was chosen deliberately — it's a **real** PWA (built by the Chrome team itself), not just a JS-heavy page. That makes the PWA code path actually exercise something.

See `results/summary.json` for the run log and each `results/<slug>.meta.json` for the full detection signals.

## Tests

```powershell
npm test
```

Five unit tests covering every branch of the classifier.

## Scripts reference

| Script                  | What it does                             |
| ----------------------- | ---------------------------------------- |
| `npm run start:dev`     | NestJS in watch mode                     |
| `npm run build`         | Compile to `dist/`                       |
| `npm run start:prod`    | Run compiled build                       |
| `npm run crawl:targets` | CLI — crawl the three assignment targets |
| `npm test`              | Run Jest unit tests                      |
| `npm run lint`          | ESLint                                   |
| `npm run format`        | Prettier                                 |

## Design notes

- **One long-lived Chromium, per-request context.** Spinning up a fresh browser per request adds ~1 s of startup; Playwright `BrowserContext`s are already isolated (separate cookies, storage, service workers) so there's no benefit to recreating the browser.
- **Path traversal guard.** `/results/:filename` strips slashes and `..` before joining so the endpoint can't be tricked into serving arbitrary files.
- **Input validation.** `ValidationPipe` with `whitelist + forbidNonWhitelisted`; unknown fields are rejected, `url` must be a valid absolute URL.
- **Graceful shutdown.** `OnModuleDestroy` closes the browser so Nest's `enableShutdownHooks`-style integrations don't leave Chromium orphaned.

## License

MIT — see [LICENSE](LICENSE).
