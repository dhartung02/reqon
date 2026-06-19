# Contributing

Thanks for your interest in improving Job Pipeline CRM.

## Ground rules

- **No personal data in commits.** `data.json`, `seed.json`, `agent/profile.json`,
  `agent/found-log.md`, `.env`, and `backups/` are gitignored. Generic `*.example.json`
  files ship instead. Never commit a real résumé, API key, name, email, or phone number.
- **Everything is configured in the UI.** New knobs must be editable in **Settings** and
  persisted server-side (to `agent/boards.json`, `agent/watchlist.json`, `agent/profile.json`,
  or `.env`). Nothing should require hand-editing a file.
- **Deterministic core stays keyless.** The scout must find + validate roles with no API key;
  AI features (rescoring, the application assistant) are optional and budget-capped.
- **Never blind-overwrite tracking edits.** Adds go through `POST /api/reqs/merge`
  (append-only by `company|role`); field changes through `PATCH /api/reqs/:key`. The
  full-array `PUT /api/reqs` is corruption-guarded and snapshots before overwriting.

## Dev setup

```bash
npm install
npm start            # http://localhost:8787  (board)  ·  /m (mobile)
```

A fresh clone boots from `seed.example.json` (sample data) — configure everything from
Settings, including uploading a résumé to generate the candidate profile.

## Before opening a PR

- `node -c server.js`
- `python3 -m py_compile agent/*.py`
- `bash tests/run.sh` (stdlib `unittest` — adapters, scoring, dedupe, `parse_ats`)
- For UI changes, load the board and confirm no console errors.
- For anything hitting external APIs, run the scout with `--dry-run`.

## Before publishing publicly

This project began as a personal deployment. The **current tree** is scrubbed of personal
data, but **git history is not** — earlier commits contain a real seed/profile. Before pushing
to a public remote: squash or re-init history (e.g. `git checkout --orphan`), and review the
launchd label in `install.sh` (`com.reqon.server`) and any owner-specific notes.

## Adding an ATS source

Drop `agent/sources/<name>.py` defining `@source("<name>") def fetch(slug)` returning the
normalized shape `{title, location, url, desc, salary}`, import it in
`agent/sources/__init__.py`, and add the posting-URL pattern to `parse_ats()` in
`agent/scout_run.py`. See `agent/SCOUT.md`.
