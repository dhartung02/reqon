# Deploying Reqon on Render (three services)

Reqon splits into three Render services from **one repo**, selected by `REQON_ROLE`:

| Service | Domain | Role | Holds data/secrets? |
|---|---|---|---|
| `reqon-api` | api.reqon.app | backend + `/health` (no UI) | **yes** — disk + secrets |
| `reqon-cloud` | cloud.reqon.app | board UI; proxies API calls to the api service | no |
| `reqon-marketing` | reqon.app | static marketing site | no |

## Blueprint vs manual

- **Blueprint (recommended):** `render.yaml` at the repo root defines all three. In Render: **New → Blueprint → pick this repo**. It creates every service with the right build/start/health settings. You then (a) fill the `sync:false` secrets on the api service, and (b) attach custom domains. Skip to **Custom domains** + **Deploy order** below.
- **Manual:** create three services by hand using the per-service settings below. Use this if you want to wire them one at a time.

`PORT` is injected by Render automatically on every service — the server already binds `process.env.PORT`. Don't set it yourself.

---

## 1. reqon-api → api.reqon.app

**Create:** New → **Web Service** → this repo. Runtime **Node**, paid instance (required for the persistent disk).

| Setting | Value |
|---|---|
| Root Directory | *(blank — repo root)* |
| Build Command | `npm install` |
| Start Command | `npm run start:api` |
| Health Check Path | `/health` |

**Disk (required — this is the only stateful service):**
- Add Disk → Name `reqon-data`, Mount Path `/var/reqon-data`, Size `1 GB`.
- This is where `data.json`, `backups/`, `agent/*` (profiles, settings, jobs, guides, audit), and per-user namespaces live. Without it, **data resets on every deploy.**

**Environment variables:**
```
REQON_ROLE=api
NODE_ENV=production
REQON_DATA_DIR=/var/reqon-data
CORS_ALLOWED_ORIGINS=https://cloud.reqon.app,https://reqon.app
REQON_CLOUD_BASE_URL=https://cloud.reqon.app
REQON_PUBLIC_BASE_URL=https://reqon.app
```

**Secrets — set ONLY on this service (never on cloud/marketing):**
```
APP_TOKEN=<strong passphrase>      # required: gates all remote API + the board login
OPENAI_API_KEY=<key>               # optional: AI assist / scoring / guides
INGEST_TOKEN=<random>              # optional: scoped capture (bookmarklet / ChatGPT Action)
SMTP_HOST / SMTP_USER / SMTP_PASS  # optional: digest + welcome emails
```
`APP_TOKEN` is what makes remote access require auth — without it the API refuses non-localhost writes. The cloud board logs in against it.

---

## 2. reqon-cloud → cloud.reqon.app

**Create:** New → **Web Service** → this repo. Runtime **Node**. No disk, no secrets.

| Setting | Value |
|---|---|
| Root Directory | *(blank — repo root)* |
| Build Command | `npm install` |
| Start Command | `npm run start:cloud` |
| Health Check Path | `/health` |

**Environment variables (all non-secret):**
```
REQON_ROLE=cloud
NODE_ENV=production
REQON_API_BASE_URL=https://api.reqon.app
```
`REQON_API_BASE_URL` is where this service proxies `/api`, `/login`, `/logout`, `/guide`, `/m`, `/pair`. It must point at the api service's public URL. **Deploy the api service first** so this resolves.

---

## 3. reqon-marketing → reqon.app

**Create:** New → **Web Service** → this repo. Runtime **Node**. No disk, no secrets.

| Setting | Value |
|---|---|
| Root Directory | *(blank — repo root)* |
| Build Command | `npm install` |
| Start Command | `npm run start:marketing` |
| Health Check Path | `/health` |

**Environment variables (all non-secret):**
```
NODE_ENV=production
REQON_ROLE=marketing
REQON_API_BASE_URL=https://api.reqon.app
REQON_CLOUD_BASE_URL=https://cloud.reqon.app
REQON_PUBLIC_BASE_URL=https://reqon.app
```

No disk. No `APP_TOKEN`. No API keys or secrets of any kind.

The service serves a public placeholder page at `/` and returns `{"ok":true,"service":"reqon-marketing","role":"marketing"}` at `/health`. All other paths return 404. No data is read or written.

---

## Custom domains (attach in this order)

For each service: **Settings → Custom Domains → Add**, then create the DNS record your registrar/Render shows (usually a `CNAME` to the service's `onrender.com` host; an apex like `reqon.app` may use an `ALIAS`/`ANAME` or Render's apex instructions). Add in this order so each service's URL exists before another points at it:

1. `api.reqon.app` → reqon-api
2. `cloud.reqon.app` → reqon-cloud
3. `reqon.app` (+ optional `www.reqon.app` redirect) → reqon-marketing

Render provisions TLS automatically once DNS verifies.

---

## Deploy order

1. **reqon-api** — deploy, attach disk, set `APP_TOKEN` + secrets, attach `api.reqon.app`, confirm `GET https://api.reqon.app/health`.
2. **reqon-cloud** — set `REQON_API_BASE_URL=https://api.reqon.app`, deploy, attach `cloud.reqon.app`.
3. **reqon-marketing** — deploy, attach `reqon.app`.

---

## Post-deploy smoke tests

**api.reqon.app**
```
curl https://api.reqon.app/health          # → {"ok":true,"service":"reqon-api","role":"api"}
curl https://api.reqon.app/                 # → JSON status (NOT the board HTML)
curl -I https://api.reqon.app/api/reqs      # → 401 (auth required) — expected without a token
```

**cloud.reqon.app**
```
curl https://cloud.reqon.app/health         # → {"ok":true,"service":"reqon-cloud","role":"cloud"}
```
- Open `https://cloud.reqon.app/` in a browser → board UI loads → log in with `APP_TOKEN` → roles list populates (proves the proxy + auth round-trip works).
- DevTools → Network: `/api/reqs` is served from `cloud.reqon.app` (proxied) and returns your data.

**reqon.app**
```
curl https://reqon.app/health    # → {"ok":true,"service":"reqon-marketing","role":"marketing"}
curl -I https://reqon.app/api/reqs  # → 404 (no API surface exposed)
```
- Open `https://reqon.app/` → placeholder page renders with "Coming soon" copy and a link to `cloud.reqon.app`.

---

## Troubleshooting

**Cloud proxy can't reach the API** (board shows network errors; `cloud /api/...` returns `502/504`)
- `REQON_API_BASE_URL` on reqon-cloud must be the **full https URL** of the api service (`https://api.reqon.app`), no trailing slash, no `/api` suffix.
- Confirm `https://api.reqon.app/health` is green first. If the api service is asleep/redeploying, the first request can 504 — retry.

**Login fails** (can't get past the login screen on cloud)
- `APP_TOKEN` must be set on **reqon-api** (not cloud). The passphrase you enter must match it.
- The login cookie is `Secure` — both domains must be **https** (they are, once Render TLS is active). Don't test login over a temporary `http` preview URL.
- The board posts `/login` to cloud, which proxies to the api; if `/login` 404s, the proxy `pathFilter` isn't matching — confirm reqon-cloud is on `REQON_ROLE=cloud` (check `/health` shows `role:"cloud"`).

**Data resets after each deploy**
- The api service needs the **persistent disk** at `/var/reqon-data` **and** `REQON_DATA_DIR=/var/reqon-data`. Without the disk, Render's filesystem is ephemeral and `data.json` reverts to the seed on redeploy.
- Verify: `curl https://api.reqon.app/api/health` (with token) shows `dataFile` under `/var/reqon-data`.
- With `REQON_DATA_DIR` set, **everything persistent lives on the disk**: `data.json`, `backups/`, all of `agent/` (profile, guides, logos, jobs, etc.), the user registry **`users.json`** (accounts + session-signing secret), the settings **`.env`** written by the Settings UI, and the uploaded **APNs key**. A legacy root `users.json` is migrated onto the disk once on first boot (never overwriting an existing one).
- **Secrets precedence:** the Render dashboard env vars always win over the disk `.env`. So `APP_TOKEN`/`OPENAI_API_KEY` set in the dashboard are authoritative; settings that exist only in the app (model, toggles, etc.) persist via the disk `.env` and survive redeploys.

**CORS / token-capture issues** (extension or bookmarklet can't write; or cloud gets CORS errors)
- The board itself uses the proxy (same-origin) and shouldn't hit CORS. If it does, you're calling the api host directly from the browser — add that origin to `CORS_ALLOWED_ORIGINS` on the api service.
- Capture tools (bookmarklet on linkedin.com, the Chrome extension) authenticate with the `X-CRM-Token` header and are allowed from any origin **without** credentials — they don't need to be in the allowlist. If they fail, check the token, not CORS.
- `CORS_ALLOWED_ORIGINS` is a comma-separated exact-origin list (scheme + host, no path).

**Marketing routing / rewrite issue** (deep links 404, or assets missing)
- Publish Directory must be `marketing` and the rewrite `/* → /index.html` (Rewrite, not Redirect) must exist.
- Images are under `marketing/images/`; if they 404, confirm they were committed (they're part of this repo).
