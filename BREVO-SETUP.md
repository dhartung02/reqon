# Brevo setup — early-access waitlist & beta invites

A walkthrough to connect your Brevo account so the `/early-access` → invite → `/join` funnel can
capture emails and send the confirmation + invite emails. ~20–30 minutes (most of it DNS).

Everything here is **optional to deploy** — Reqon no-ops cleanly when `BREVO_API_KEY` is unset (the
waitlist still records locally; emails are just skipped). Wire Brevo when you're ready to actually
email people.

When you're done you'll have filled in these env vars:

```
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=Reqon
BREVO_WAITLIST_LIST_ID=
BREVO_BETA_LIST_ID=
BREVO_TPL_CONFIRM=     # optional
BREVO_TPL_INVITE=      # optional
PUBLIC_URL=https://cloud.reqon.app
```

---

## Step 1 — API key

1. Log in at **app.brevo.com**.
2. Top-right menu → **SMTP & API** → **API Keys** tab → **Generate a new API key**.
3. Name it `reqon-server`, copy the key (starts with `xkeysib-`).
4. → set as **`BREVO_API_KEY`**.

The free plan (300 emails/day) is plenty for a private beta.

## Step 2 — Verify a sender + authenticate your domain  *(the deliverability step)*

Emails sent from an unauthenticated domain land in spam. Do both:

1. Menu → **Senders, Domains & Dedicated IPs**.
2. **Senders** tab → **Add a sender**: name `Reqon`, email `hello@reqon.app` (any address @ your domain).
   → set **`BREVO_SENDER_EMAIL=hello@reqon.app`** and **`BREVO_SENDER_NAME=Reqon`**.
3. **Domains** tab → **Add a domain** → `reqon.app` → **Authenticate**. Brevo shows a set of DNS
   records (a DKIM `TXT`/`CNAME`, an SPF `TXT`, and a Brevo verification record).
4. Add those records at your DNS host (Cloudflare for reqon.app). Then click **Verify** in Brevo.
   DNS can take minutes to a few hours to propagate.
5. (Recommended) add a **DMARC** record once DKIM/SPF pass: a `TXT` at `_dmarc.reqon.app` =
   `v=DMARC1; p=none; rua=mailto:dmarc@reqon.app`.

> You can test with an unverified sender, but verify before inviting real users or invites will spam-folder.

## Step 3 — Contact lists

1. Menu → **Contacts** → **Lists** → **Add a list**.
2. Create **`Reqon Waitlist`** and **`Reqon Beta`**.
3. Get each list's numeric **ID** — open the list; the ID is in the URL (`.../lists/`**`7`**`/...`) or
   in the list's settings.
4. → **`BREVO_WAITLIST_LIST_ID`** = the Waitlist id, **`BREVO_BETA_LIST_ID`** = the Beta id.

What Reqon does: a waitlist signup is added to **Waitlist**; once they create their account they're
added to **Beta** (so you can message cohorts separately).

## Step 4 — Email templates  *(optional — skip to use Reqon's built-in emails)*

If you want to edit the email copy in Brevo (vs. the built-in HTML), create two templates:

1. Menu → **Campaigns** → **Templates** (or **Transactional → Templates**) → **New template** →
   choose the **drag-and-drop** or **rich text** editor.
2. **Confirmation** template ("you're on the list"). Optional personalization: `{{ params.name }}`.
   Save → note its numeric **template ID** → **`BREVO_TPL_CONFIRM`**.
3. **Invite** template. **Must include the button/link** using the variable **`{{ params.link }}`**
   (e.g. a button whose URL is `{{ params.link }}`). Save → note its ID → **`BREVO_TPL_INVITE`**.

Leave these unset and Reqon sends clean built-in HTML instead — totally fine for the beta.

## Step 5 — Set the env vars

**Local** (`.env` in the repo root): paste the seven vars from the top of this doc.

**Production (Render)** → the **reqon-api** service → **Environment** → add each var (these are
secrets/config; they live on the API service, which is where the funnel routes run). Also confirm
**`PUBLIC_URL=https://cloud.reqon.app`** so invite links point at the right place. Redeploy/restart.

## Step 6 — Test the whole funnel

1. Restart the server. Visit **`/early-access`** (locally `http://localhost:8787/early-access`).
2. Submit the form with **your own email** + the consent box.
   - ✅ In Brevo → **Contacts** → **Reqon Waitlist**: your email appears (with name/role attributes).
   - ✅ You receive the "You're on the list" email (check spam if the domain isn't authenticated yet).
3. Sign in as the admin → the board can list the waitlist (`GET /api/waitlist`); approve your entry
   (`POST /api/waitlist/invite` with your email). *(A small admin UI for this is a quick follow-up; for
   now it's an API call / curl.)*
   - ✅ You receive the invite email; the link is `…/join?token=…`.
4. Click it → the **create-account** page → set a password → you're signed in.
   - ✅ In Brevo → **Reqon Beta** list: your contact moved over.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No email arrives | Sender not verified / domain not authenticated (Step 2); check spam; DNS not propagated yet. |
| Contact doesn't appear in the list | Wrong list ID, or the API key lacks contact permissions (regenerate with full access). |
| `Brevo 401` in server logs | Bad/expired `BREVO_API_KEY`. |
| Invite link points at the wrong host | `PUBLIC_URL` unset — it falls back to the request host. |
| Everything "skipped" in logs | `BREVO_API_KEY` not set on that service — expected until you add it. |

## Notes

- All Brevo calls are best-effort: a Brevo outage never blocks a signup (the waitlist still records
  locally, and account creation never depends on email).
- Beta testers are created with `license="ai"` — full Cloud + AI, free. No billing is involved in the
  beta. (Stripe is Phase 1 — see `MVP-WORKPLAN.md`.)
