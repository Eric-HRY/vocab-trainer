#!/usr/bin/env python3
"""Harvest human pronunciation MP3s for the 啸啸单词斩 vocab trainer.

Sources (priority order):
  1. Wiktionary human recordings via https://api.dictionaryapi.dev (uk > us > other; mp3 only)
  2. Youdao dictvoice (validated real MP3 only; JSON error bodies are discarded)

Strategy per entry:
  - single word : dictionaryapi -> youdao
  - multi-word  : youdao whole phrase -> per-token split (dictionaryapi -> youdao per token)
                  all tokens must succeed, otherwise the entry is left without audio
                  (runtime TTS fallback) and no partial files are kept.

Politeness: a global throttle guarantees >= 0.15 s between any two request STARTS,
even though a few worker threads overlap download bodies (CDN throughput is the
bottleneck, not request rate). A failing URL is retried at most twice (1 s apart).

Resumable: per-entry results are recorded in scripts/harvest-report.json; entries whose
files already exist and validate are skipped. Re-running is safe.

Usage:
  python3 harvest-audio.py [--limit N] [--retry-failed] [--verify] [--workers K]
"""
import argparse
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from queue import Queue

# This environment's IPv6 routes stall for ~10 s per connect; force IPv4.
_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_getaddrinfo(host, port, family=0, *a, **kw):
    return _orig_getaddrinfo(host, port, socket.AF_INET, *a, **kw)


socket.getaddrinfo = _ipv4_getaddrinfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS_PATH = os.path.join(ROOT, "src", "data", "words.json")
AUDIO_DIR = os.path.join(ROOT, "public", "audio")
MANIFEST_PATH = os.path.join(ROOT, "src", "data", "audio-manifest.json")
REPORT_PATH = os.path.join(ROOT, "scripts", "harvest-report.json")

MIN_BYTES = 2048          # files must be larger than 2 KB
POLITE_GAP = 0.16         # >= 0.15 s between request starts (global)
RETRY_GAP = 1.0           # 1 s between retries
MAX_RETRIES = 2           # retry a failing URL at most twice
TIMEOUT = 25              # media downloads (CDN throughput ~7 KB/s)
API_TIMEOUT = 5           # dictionaryapi lookups — healthy answers take <2 s;
                          # stalled connections are abandoned quickly
API_RETRIES = 1           # API gets a single retry (global limit is <= 2)

UA = {"User-Agent": "Mozilla/5.0 (Macintosh) vocab-audio-harvest/1.0"}

_throttle_lock = threading.Lock()
_report_lock = threading.Lock()
_last_request_at = [0.0]


def http_get(url, timeout=TIMEOUT, retries=MAX_RETRIES):
    """GET url, return bytes or None. Limited retries; 4xx answers are final."""
    for attempt in range(retries + 1):
        with _throttle_lock:
            gap = time.time() - _last_request_at[0]
            if gap < POLITE_GAP:
                time.sleep(POLITE_GAP - gap)
            _last_request_at[0] = time.time()
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(RETRY_GAP)
                continue
            return None
        except Exception:
            if attempt < retries:
                time.sleep(RETRY_GAP)
                continue
            return None
    return None


def looks_like_mp3(buf):
    """Real-audio check: size > 2KB and MP3 magic (ID3 tag or MPEG frame sync)."""
    if not buf or len(buf) <= MIN_BYTES:
        return False
    if buf[:3] == b"ID3":
        return True
    return buf[0] == 0xFF and (buf[1] & 0xE0) == 0xE0


def fetch_dictionaryapi(word):
    """Wiktionary human recording for a single word. Returns bytes or None."""
    url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + urllib.parse.quote(word)
    raw = http_get(url, timeout=API_TIMEOUT, retries=API_RETRIES)
    if not raw:
        return None
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        return None
    if not isinstance(data, list):
        return None
    audios = []
    for entry in data:
        for ph in entry.get("phonetics", []) or []:
            a = ph.get("audio") or ""
            if not a:
                continue
            if a.startswith("//"):
                a = "https:" + a
            audios.append(a)

    def rank(u):
        ul = u.lower()
        if "-uk.mp3" in ul:
            return 0
        if "-us.mp3" in ul:
            return 1
        return 2

    for u in sorted(set(audios), key=rank):
        if not u.lower().endswith(".mp3"):
            continue  # skip .ogg etc. — we must deliver real MP3
        buf = http_get(u)
        if looks_like_mp3(buf):
            return buf
    return None


def fetch_youdao(text):
    """Youdao pronunciation for a word or phrase. Returns bytes or None."""
    url = "https://dict.youdao.com/dictvoice?audio=" + urllib.parse.quote(text) + "&type=1"
    buf = http_get(url)
    return buf if looks_like_mp3(buf) else None


PAREN_RE = re.compile(r"\([^)]*\)")


def spoken_text(word):
    """Strip parenthetical content — brackets are not pronounced."""
    return PAREN_RE.sub("", word).strip()


def split_tokens(text):
    """Split on whitespace and '/', drop empty / pure-punctuation tokens."""
    toks = []
    for part in re.split(r"[\s/]+", text):
        part = part.strip(".,;:!?\"'")
        if part:
            toks.append(part)
    return toks


def harvest_entry(entry):
    """Returns (files, source). files = list of (filename, bytes); None if no audio."""
    wid = entry["id"]
    text = spoken_text(entry["word"])
    toks = split_tokens(text)
    if not toks:
        return None, "none"

    if len(toks) == 1:
        tok = toks[0]
        buf = fetch_dictionaryapi(tok)
        if buf:
            return [(f"{wid}.mp3", buf)], "wiktionary"
        buf = fetch_youdao(tok)
        if buf:
            return [(f"{wid}.mp3", buf)], "youdao"
        return None, "none"

    # multi-word: whole phrase via youdao first
    phrase = " ".join(toks)
    buf = fetch_youdao(phrase)
    if buf:
        return [(f"{wid}.mp3", buf)], "youdao-phrase"

    # fall back to per-token sequence; all-or-nothing (in memory until complete)
    files = []
    any_wiktionary = False
    for i, tok in enumerate(toks, 1):
        buf = fetch_dictionaryapi(tok)
        if buf:
            any_wiktionary = True
        else:
            buf = fetch_youdao(tok)
        if not buf:
            return None, "none"
        files.append((f"{wid}_{i}.mp3", buf))
    return files, ("wiktionary-split" if any_wiktionary else "youdao-split")


def file_ok(path):
    try:
        if os.path.getsize(path) <= MIN_BYTES:
            return False
        with open(path, "rb") as f:
            head = f.read(3)
        return head[:3] == b"ID3" or (head[0] == 0xFF and (head[1] & 0xE0) == 0xE0)
    except OSError:
        return False


def write_file_atomic(name, buf):
    tmp = os.path.join(AUDIO_DIR, name + ".tmp")
    dst = os.path.join(AUDIO_DIR, name)
    with open(tmp, "wb") as f:
        f.write(buf)
    os.replace(tmp, dst)


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def rebuild_manifest(words, report):
    """Manifest strictly reflects files that exist on disk and validate."""
    manifest = {}
    for e in words:
        rec = report.get(e["id"])
        if not rec or not rec.get("files"):
            continue
        if all(file_ok(os.path.join(AUDIO_DIR, n)) for n in rec["files"]):
            manifest[e["id"]] = rec["files"]
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    return manifest


def _worker(q, report, stats, total):
    while True:
        e = q.get()
        if e is None:
            q.task_done()
            return
        try:
            files, source = harvest_entry(e)
            with _report_lock:
                if files:
                    for name, buf in files:
                        write_file_atomic(name, buf)
                    report[e["id"]] = {"files": [n for n, _ in files], "source": source}
                else:
                    # drop stale partial files of a previously interrupted attempt
                    for n in (report.get(e["id"]) or {}).get("files", []):
                        p = os.path.join(AUDIO_DIR, n)
                        if os.path.exists(p):
                            os.remove(p)
                    report[e["id"]] = {"files": [], "source": "none"}
                stats["done"] += 1
                n = stats["done"]
                if n % 25 == 0:  # checkpoint so a killed run stays resumable
                    with open(REPORT_PATH + ".tmp", "w", encoding="utf-8") as f:
                        json.dump(report, f, ensure_ascii=False, indent=1, sort_keys=True)
                    os.replace(REPORT_PATH + ".tmp", REPORT_PATH)
            if n % 50 == 0 or n == total:
                covered = stats["covered"]
                print(f"[progress] {n}/{total} this run | {covered} covered so far",
                      flush=True)
        except Exception as ex:  # never let one entry kill a worker
            with _report_lock:
                stats["errors"].append((e["id"], repr(ex)))
        finally:
            q.task_done()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="process at most N pending entries")
    ap.add_argument("--retry-failed", action="store_true",
                    help="re-attempt entries recorded as no-audio")
    ap.add_argument("--verify", action="store_true",
                    help="no downloads; rebuild manifest & print full stats")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    os.makedirs(AUDIO_DIR, exist_ok=True)
    with open(WORDS_PATH, encoding="utf-8") as f:
        words = json.load(f)
    report = load_json(REPORT_PATH, {})

    if not args.verify:
        pending = []
        for e in words:
            rec = report.get(e["id"])
            if rec and rec.get("files") and all(
                file_ok(os.path.join(AUDIO_DIR, n)) for n in rec["files"]
            ):
                continue  # already harvested, valid on disk
            if rec and rec.get("source") == "none" and not args.retry_failed:
                continue  # known failure; skip unless asked to retry
            pending.append(e)
        if args.limit:
            pending = pending[: args.limit]

        stats = {
            "done": 0,
            "covered": sum(1 for r in report.values() if r.get("files")),
            "errors": [],
        }
        q = Queue()
        threads = []
        for _ in range(max(1, min(args.workers, len(pending) or 1))):
            t = threading.Thread(target=_worker, args=(q, report, stats, len(pending)),
                                 daemon=True)
            t.start()
            threads.append(t)
        for e in pending:
            q.put(e)
        for _ in threads:
            q.put(None)
        q.join()

        with open(REPORT_PATH, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=1, sort_keys=True)
            f.write("\n")
        newly = sum(1 for e in pending
                    if report.get(e["id"], {}).get("files"))
        print(f"[run done] processed {len(pending)} entries, "
              f"newly covered {newly}, errors {len(stats['errors'])}", flush=True)
        for wid, ex in stats["errors"][:10]:
            print(f"  [error] {wid}: {ex}", flush=True)

    manifest = rebuild_manifest(words, report)

    # ---- stats ----
    covered = set(manifest.keys())
    no_audio = [(e["id"], e["word"]) for e in words if e["id"] not in covered]
    sources = {}
    for wid in covered:
        s = (report.get(wid) or {}).get("source", "unknown")
        sources[s] = sources.get(s, 0) + 1
    wikt = sources.get("wiktionary", 0) + sources.get("wiktionary-split", 0)
    yd = sources.get("youdao", 0) + sources.get("youdao-phrase", 0) + sources.get("youdao-split", 0)
    phrase = sources.get("youdao-phrase", 0)
    split = sources.get("wiktionary-split", 0) + sources.get("youdao-split", 0)

    print("=" * 60)
    print(f"total entries          : {len(words)}")
    print(f"covered                : {len(covered)} ({len(covered) / len(words) * 100:.1f}%)")
    print(f"  dictionaryapi (human): {wikt}")
    print(f"  youdao               : {yd}")
    print(f"  whole-phrase entries : {phrase}")
    print(f"  token-sequence entries: {split}")
    print(f"no audio (TTS fallback): {len(no_audio)}")
    for wid, w in no_audio:
        print(f"  - {wid}  {w}")
    bad = [n for wid in covered for n in manifest[wid]
           if not file_ok(os.path.join(AUDIO_DIR, n))]
    print(f"manifest files invalid : {len(bad)}" + (f" -> {bad[:10]}" if bad else ""))


if __name__ == "__main__":
    main()
