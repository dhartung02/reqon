#!/usr/bin/env python3
"""
setup-vector-store.py — one-time setup for file_search grounding (T2.4).

Creates an OpenAI vector store named "reqon-candidate", uploads the candidate's résumé and a
narratives file, and prints the vector_store_id to put in .env as OPENAI_VECTOR_STORE_ID. Once set,
the server passes file_search on draft + interview-guide generation so the model retrieves from
these documents instead of relying on inline-pasted narratives (better grounding, fewer tokens).

USAGE
    export OPENAI_API_KEY=sk-...                 # or rely on it being in your shell/.env
    python3 agent/setup-vector-store.py          # uses agent/<resume>.docx + agent/profile.json narratives
    python3 agent/setup-vector-store.py --files path/to/resume.pdf path/to/notes.md

Re-run after your résumé/narratives change to refresh (it creates a fresh store; update .env with
the new id). Stdlib only — talks to the OpenAI REST API over urllib.
"""
import argparse
import glob
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load_dotenv():
    """Load KEY=value lines from <repo>/.env into os.environ (without overriding real env vars).
    The server does this on boot; standalone scripts don't, so do it here for convenience."""
    path = os.path.join(ROOT, ".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except FileNotFoundError:
        pass


load_dotenv()
BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")


def _req(method, path, key, data=None, headers=None, raw=False):
    url = BASE + path
    h = {"Authorization": "Bearer " + key}
    if headers:
        h.update(headers)
    body = data if raw else (json.dumps(data).encode("utf-8") if data is not None else None)
    if not raw and data is not None:
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        raise SystemExit("OpenAI %s %s -> HTTP %s\n%s" % (method, path, e.code, detail[:800]))


def upload_file(key, path):
    """Multipart/form-data upload to /files with purpose=assistants (file_search), stdlib only."""
    boundary = "----reqon" + os.urandom(8).hex()
    b = boundary.encode()
    crlf = b"\r\n"
    fn = os.path.basename(path)
    with open(path, "rb") as f:
        content = f.read()
    body = b"".join([
        b"--", b, crlf,
        b'Content-Disposition: form-data; name="purpose"', crlf, crlf,
        b"assistants", crlf,
        b"--", b, crlf,
        ('Content-Disposition: form-data; name="file"; filename="%s"' % fn).encode("utf-8"), crlf,
        b"Content-Type: application/octet-stream", crlf, crlf,
        content, crlf,
        b"--", b, b"--", crlf,
    ])
    out = _req("POST", "/files", key, data=body, raw=True,
               headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    return out["id"]


def narratives_to_tmp():
    """Write profile.json narratives to a temp text file so they're searchable too."""
    pj = os.path.join(HERE, "profile.json")
    try:
        with open(pj, encoding="utf-8") as f:
            prof = json.load(f)
    except Exception:
        return None
    narr = prof.get("narratives", [])
    if not narr:
        return None
    tmp = os.path.join(HERE, "_narratives.txt")
    with open(tmp, "w", encoding="utf-8") as f:
        for n in narr:
            f.write("## %s\n%s\n\n" % (n.get("title", ""), n.get("body", "")))
    return tmp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", nargs="*", help="explicit files to upload (else auto-detect résumé + narratives)")
    ap.add_argument("--name", default="reqon-candidate")
    args = ap.parse_args()

    load_dotenv()   # so OPENAI_API_KEY in .env works without exporting it
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise SystemExit("Set OPENAI_API_KEY (in .env or your environment) first.")

    files = list(args.files or [])
    if not files:
        for pat in ("*[Rr]esume*.docx", "*[Rr]esume*.pdf"):
            files += glob.glob(os.path.join(HERE, pat))
        n = narratives_to_tmp()
        if n:
            files.append(n)
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        raise SystemExit("No files to upload. Pass --files, or put a résumé in agent/ and narratives in profile.json.")

    print("Creating vector store '%s'…" % args.name)
    vs = _req("POST", "/vector_stores", key, data={"name": args.name})
    vs_id = vs["id"]

    for path in files:
        print("  uploading %s …" % os.path.basename(path))
        fid = upload_file(key, path)
        _req("POST", "/vector_stores/%s/files" % vs_id, key, data={"file_id": fid})

    print("\nDone. Add this to your .env, then restart the board:\n")
    print("    OPENAI_VECTOR_STORE_ID=%s\n" % vs_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
