# Deployment status — Reqon production (Render)

Three services, one repo, selected by `REQON_ROLE`. Last updated 2026-06-26.

---

## Services

### 1. `api.reqon.app` — reqon-api

**Purpose:** The only stateful service. Runs all data logic (reads/writes `data.json`), the full
`/api/*` surface, AI assist, job registry, guide generation, digest, and notifications. Root `/`
returns a JSON status blob — the board UI is intentionally NOT served here.

| Setting | Value |
|---|---|
| Render service name | `reqon-api` |
| Runtime | Node |
| Plan | Starter (paid — required for persistent disk) |
| Build command | `npm install` |
| Start command | `npm run start:api` (sets `REQON_ROLE=api`) |
| Health check path | `/health` |
| Health response | `{"ok":true,"service":"reqon-api","role":"api"}` |
| Auto-deploy | yes |

**Persistent disk (required — attach before first deploy):**

| Field | Value |
|---|---|
| Name | `reqon-data` |
| Mount path | `/var/reqon-data` |
| Size | 1 GB |

Without the disk every redeploy wipes `data.json`, `backups/`, `agent/` (profile, guides, jobs,
audit), `users.json`, the disk-backed `.env`, and the APNs key.

**Environment variables:**

| Key | Value | Secret? |
|---|---|---|
| `REQON_ROLE` | `api` | no |
| `NODE_ENV` | `production` | no |
| `REQON_DATA_DIR` | `/var/reqon-data` | no |
| `CORS_ALLOWED_ORIGINS` | `https://cloud.reqon.app,https://reqon.app` | no |
| `REQON_CLOUD_BASE_URL` | `https://cloud.reqon.app` | no |
| `REQON_PUBLIC_BASE_URL` | `https://reqon.app` | no |
| `APP_TOKEN` | strong passphrase | **yes** |
| `OPENAI_API_KEY` | OpenAI key | yes (optional) |
| `INGEST_TOKEN` | random token | yes (optional) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | SMTP creds | yes (optional) |

`PORT` is injected automatically by Render; do not set it.

**Auth behavior:**

- `APP_TOKEN` gates all remote write and read access. When set, every non-localhost `/api/*`
  request requires a valid session cookie (obtained via `POST /login`).
- `/health` is never gated — Render's health checker hits it unauthenticated.
- `GET /` returns JSON `{"ok":true,"service":"reqon-api","message":"...","health":"/health"}` —
  it is NOT the board UI.
- `GET /api/reqs` without a token → `401 Unauthorized`.
- `INGEST_TOKEN` (if set) allows capture-tool writes (`/api/reqs/merge`, `/api/reqs/quickadd`)
  via `X-CRM-Token` header from any origin, without needing an `APP_TOKEN` session cookie.

---

### 2. `cloud.reqon.app` — reqon-cloud

**Purpose:** Serves the board UI (single-page app at `public/index.html`) and reverse-proxies all
dynamic paths to `reqon-api`. No data files, no secrets, no disk. The browser stays same-origin
with `cloud.reqon.app`; the proxy rewrites cookies and auth headers transparently.

Proxied paths: `/api/*`, `/login`, `/logout`, `/guide`, `/m`, `/mobile`, `/pair`.

| Setting | Value |
|---|---|
| Render service name | `reqon-cloud` |
| Runtime | Node |
| Plan | Starter |
| Build command | `npm install` |
| Start command | `npm run start:cloud` (sets `REQON_ROLE=cloud`) |
| Health check path | `/health` |
| Health response | `{"ok":true,"service":"reqon-cloud","role":"cloud"}` |
| Auto-deploy | yes |
| Persistent disk | **none** |

**Environment variables:**

| Key | Value | Secret? |
|---|---|---|
| `REQON_ROLE` | `cloud` | no |
| `NODE_ENV` | `production` | no |
| `REQON_API_BASE_URL` | `https://api.reqon.app` | no |

No `APP_TOKEN` or secrets of any kind on this service.

**Auth / passphrase behavior:**

The cloud service itself holds no passphrase. When the user hits a protected route:

1. Browser is redirected to `GET /login` → cloud serves the login page.
2. User submits passphrase → `POST /login` → proxied to `reqon-api`.
3. API validates against its `APP_TOKEN`, sets a `Secure` session cookie.
4. Cookie flows back through the proxy; subsequent `/api/*` calls are authenticated.

The passphrase the user types must match `APP_TOKEN` on `reqon-api`. If `APP_TOKEN` is unset on
the API, `/login` returns `503 Remote access disabled`.

---

### 3. `reqon.app` — reqon-marketing

**Purpose:** Public placeholder only. Serves a branded "coming soon" page at `/` with a CTA link
to `cloud.reqon.app`. Every other path returns `404 Not found`. No API surface, no data, no auth,
no secrets.

| Setting | Value |
|---|---|
| Render service name | `reqon-marketing` |
| Runtime | Node |
| Plan | Starter (free tier sufficient) |
| Build command | `npm install` |
| Start command | `npm run start:marketing` (sets `REQON_ROLE=marketing`) |
| Health check path | `/health` |
| Health response | `{"ok":true,"service":"reqon-marketing","role":"marketing"}` |
| Auto-deploy | yes |
| Persistent disk | **none** |

**Environment variables:**

| Key | Value | Secret? |
|---|---|---|
| `NODE_ENV` | `production` | no |
| `REQON_ROLE` | `marketing` | no |
| `REQON_API_BASE_URL` | `https://api.reqon.app` | no |
| `REQON_CLOUD_BASE_URL` | `https://cloud.reqon.app` | no |
| `REQON_PUBLIC_BASE_URL` | `https://reqon.app` | no |

No `APP_TOKEN`, no `OPENAI_API_KEY`, no secrets.

**Placeholder behavior:**

The inline HTML served at `GET /` is defined in `server.js` (not `marketing/index.html`). It
displays the Reqon wordmark, tagline, "The public site is coming soon.", and a periwinkle button
linking to `REQON_CLOUD_BASE_URL`. A catch-all middleware blocks every other route (`404`), so no
API, auth, or data path is reachable regardless of what else `server.js` defines.

---

## Cloudflare DNS (expected records)

Render provisions TLS automatically once DNS verifies. Use DNS-only mode (gray cloud) in
Cloudflare for all four records so Render's certificate provisioning can complete via HTTP
challenge.

| Record | Type | Target |
|---|---|---|
| `api.reqon.app` | CNAME | Render-assigned hostname for `reqon-api` |
| `cloud.reqon.app` | CNAME | Render-assigned hostname for `reqon-cloud` |
| `reqon.app` | ALIAS / ANAME | Render-assigned hostname for `reqon-marketing` |
| `www.reqon.app` | CNAME or redirect | → `reqon.app` |

The exact `*.onrender.com` hostname for each service is shown in Render under
**Settings → Custom Domains** after the service is created. Attach custom domains in the order
listed (api → cloud → marketing) so each URL resolves before another service depends on it.

---

## Smoke test checklist

Run these after every deploy or DNS change.

### reqon-api

```
curl https://api.reqon.app/health
# expect: {"ok":true,"service":"reqon-api","role":"api"}

curl https://api.reqon.app/
# expect: JSON status blob — NOT board HTML

curl -I https://api.reqon.app/api/reqs
# expect: HTTP 401 (auth required without a token)
```

### reqon-cloud

```
curl https://cloud.reqon.app/health
# expect: {"ok":true,"service":"reqon-cloud","role":"cloud"}
```

- Open `https://cloud.reqon.app/` in a browser → login page or board loads.
- Enter `APP_TOKEN` passphrase → board populates with roles.
- DevTools → Network: `/api/reqs` is served from `cloud.reqon.app` (proxied) and returns data.

### reqon-marketing

```
curl https://reqon.app/health
# expect: {"ok":true,"service":"reqon-marketing","role":"marketing"}

curl https://reqon.app/
# expect: HTML with "Reqon" heading and "coming soon" copy

curl -I https://reqon.app/api/reqs
# expect: HTTP 404 (no API surface)

curl -I https://reqon.app/api/health
# expect: HTTP 404 (only /health at root is served, not /api/health)
```

---

## Known temporary state

### Marketing page is a placeholder

`reqon.app` currently serves an inline HTML snippet from `server.js`, not the full-featured
`marketing/index.html` in the repo (which has the complete brand page: hero, feature grid,
testimonials, etc.). The inline placeholder will be replaced once the marketing site is ready to
publish.

### render.yaml is outdated for reqon-marketing

The `render.yaml` Blueprint still defines `reqon-marketing` as `type: static` with
`staticPublishPath: ./marketing`, which would serve the static `marketing/index.html` directly
via Render's CDN with no Node process. The current production configuration (per commit `9befe22`)
uses a **Node web service** with `npm run start:marketing`. The Blueprint will create the wrong
service type if re-applied without first updating `render.yaml`.

**Do not re-apply the Blueprint until `render.yaml` is corrected.** Manage the marketing service
manually in the Render dashboard for now.

---

## Recommended next steps

1. **Update `render.yaml`** — change `reqon-marketing` from `type: static` to `type: web` with
   `runtime: node`, `buildCommand: npm install`, `startCommand: npm run start:marketing`, and the
   five env vars listed above. This keeps Blueprint and dashboard in sync.

2. **Wire `marketing/index.html` into the marketing role** — once the public site is ready,
   update `server.js`'s `SERVE_MARKETING` block to serve the static file (or update the Blueprint
   back to `type: static` for zero-Node hosting cost).

3. **Add `www.reqon.app` redirect** — verify a CNAME or page-rule redirect exists so
   `www.reqon.app` resolves rather than timing out.

4. **APNs push notifications** — the server-side APNs sender is built and deployed but inert.
   Upload the `.p8` key via Settings → Push Notifications on the board to activate on-device
   push for follow-up reminders and scout results.

5. **Confirm Cloudflare proxy mode** — ensure all four DNS records are set to DNS-only (gray
   cloud), not proxied (orange cloud), unless a Cloudflare origin certificate is configured;
   orange-cloud mode intercepts TLS and can break Render's certificate provisioning.
