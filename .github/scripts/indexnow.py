"""Notify IndexNow after changed public pages have actually deployed."""

import argparse
import hashlib
import json
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HOST = "quillpane.shreyam1008.com.np"
BASE = f"https://{HOST}/"
KEY = "78d46b02e1f9476d8653e824a0a51c29"
PAGES = {"index.html": BASE, "privacy.html": BASE + "privacy.html"}


def prepare(previous, output):
    initial = not (previous / f"{KEY}.txt").exists()
    changed = {}
    for filename, url in PAGES.items():
        content = (Path("docs") / filename).read_bytes()
        old = previous / filename
        if initial or not old.exists() or old.read_bytes() != content:
            changed[url] = hashlib.sha256(content).hexdigest()
    output.write_text(json.dumps(changed), encoding="utf-8")
    print(f"IndexNow: {len(changed)} changed public pages queued")


def fetch(url):
    with urlopen(url, timeout=15) as response:
        return response.read()


def submit(queue):
    changed = json.loads(queue.read_text(encoding="utf-8"))
    if not changed:
        print("IndexNow: no public page changes; no notification sent")
        return
    if not set(changed).issubset(PAGES.values()):
        raise ValueError("Only canonical public pages may be submitted")
    # APT can already be current while Cloudflare still serves an older page.
    for attempt in range(18):
        try:
            ready = fetch(BASE + KEY + ".txt").decode().strip() == KEY
            ready = ready and all(
                hashlib.sha256(fetch(url)).hexdigest() == digest
                for url, digest in changed.items()
            )
            if ready:
                break
        except (HTTPError, URLError, TimeoutError):
            pass
        if attempt == 17:
            raise RuntimeError("Public pages/key have not reached this deployment")
        time.sleep(10)
    payload = json.dumps({
        "host": HOST,
        "key": KEY,
        "keyLocation": BASE + KEY + ".txt",
        "urlList": list(changed),
    }).encode()
    request = Request("https://api.indexnow.org/indexnow", data=payload,
                      headers={"Content-Type": "application/json; charset=utf-8"})
    with urlopen(request, timeout=30) as response:
        if response.status not in (200, 202):
            raise RuntimeError(f"Unexpected IndexNow status: {response.status}")
        print(f"IndexNow HTTP {response.status}: {len(changed)} URLs received; "
              "indexing is not guaranteed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "submit"))
    parser.add_argument("queue", type=Path)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args()
    if args.mode == "prepare":
        if args.previous is None:
            parser.error("prepare requires --previous")
        prepare(args.previous, args.queue)
    else:
        submit(args.queue)
