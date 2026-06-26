# Device testing checklist

Things that can only be verified on a real device (mic, push, share sheet, dev-build-only native
modules) — they pass `tsc`/`jest`/route smoke-tests in CI but need a human on the **M4 iPad Pro**
(or a phone) running a **dev build** (`npx expo run:ios`, not Expo Go).

Mark each ✅/❌ as you go; note anything that needs a follow-up fix.

---

## 🎤 Voice narratives (PR: feature/voice-narratives)

Requires a **dev build** — `expo-audio` is a native module and will not run in Expo Go.
Server route `POST /api/transcribe` (OpenAI Whisper) is wired and verified end-to-end except the
actual audio decode (which needs a real clip). Mic permission string is in `app.json`.

Pre-req: app is paired to the server and the server has a working `OPENAI_API_KEY` with the AI
assistant enabled.

- [ ] **Permission prompt** — Profile → Narratives → ✨ Build from résumé → open a suggestion →
      **🎤 Speak it** → tap **● Start recording**. iOS asks for microphone access the first time;
      the prompt text reads "Reqon uses the microphone so you can speak your résumé narratives…".
- [ ] **Permission denied path** — deny once; confirm the inline error tells you to enable it in
      Settings rather than crashing.
- [ ] **Record + live timer** — timer counts up in green while recording; **■ Stop & transcribe**
      shows; "Up to 4 min · auto-stops" hint is visible.
- [ ] **Transcription round-trip** — speak ~20s describing a work story → Stop → spinner
      "Transcribing…" → transcript drops into the **Your story** box; status says "Transcribed —
      edit, then polish."
- [ ] **Append, don't clobber** — start from a suggestion (which pre-fills a draft), then 🎤 Speak
      it: the transcript is **appended** below the existing text, not overwritten.
- [ ] **Dictate-new path** — from the suggestion list, **🎤 Dictate a new narrative** opens a blank
      editor with the recorder already open.
- [ ] **Auto-stop** — let a recording run past 4:00; it auto-stops and transcribes (guards the 8 MB
      upload limit). *(Optional / slow — skip if short on time.)*
- [ ] **Polish + add** — after transcribing, **✨ Polish** tightens it; **Add** puts it in the
      Narratives list; **Save** persists it (reopen Profile to confirm it stuck, and check it shows
      on the web board's narrative library after a sync).
- [ ] **Cancel mid-record** — tap **Cancel** while recording; no orphaned recording, no crash;
      reopening voice works.
- [ ] **Slow-link behavior** — on a weak connection, the upload/transcribe shows the spinner and
      fails gracefully with a readable error after the 90s timeout (doesn't hang forever).
- [ ] **Cost sanity** — after a couple of transcriptions, Settings → AI usage call count went up
      (Whisper is billed per audio-minute, logged as a call with `kind:"transcribe"`).

---

## Previously parked native items (from CLAUDE.md "Open follow-ups")

These also need the dev build / a real device and have not had a device pass yet:

- [ ] **Native Share Extension** — Safari Share → "Add to CRM" adds a role.
- [ ] **On-device push registration** — APNs token registers (server sender is built but inert
      until configured).
- [ ] **Local notifications** — follow-up-due / leads-to-verify reminders fire.
- [ ] **iPad landscape master-detail** — open-row highlight, the SectionList-virtualized pipeline.
- [ ] **QR pairing** — board → app scan connects without typing URL + passphrase.
- [ ] **Gmail ingest panel** — enter App Password → Test dry-run → Run now.
