#!/usr/bin/env python3
"""Generate search-index.json for The Award Hacker from the 7 article files.

Run from the site root:  python3 scripts/gen-search-index.py
Output: search-index.json at the site root.

For each article it records:
  title    - from <title>, with the " | The Award Hacker" suffix stripped
  url      - "articles/<slug>.html" (relative to site root)
  excerpt  - first ~160 chars of the first real paragraph of article .prose
  headings - the h2 section headings (excluding the FAQ / Keep reading blocks)
"""
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLES_DIR = os.path.join(ROOT, "articles")
OUT_PATH = os.path.join(ROOT, "search-index.json")

# h2 blocks to leave out of the index's heading list
SKIP_HEADINGS = {"faq", "keep reading"}


def clean(text):
    text = re.sub(r"<[^>]+>", "", text)          # strip tags
    text = html.unescape(text)                    # decode entities
    text = re.sub(r"\s+", " ", text).strip()      # collapse whitespace
    return text


def parse_article(path):
    with open(path, encoding="utf-8") as f:
        src = f.read()

    slug = os.path.basename(path)

    m = re.search(r"<title>(.*?)</title>", src, re.S | re.I)
    title = clean(m.group(1)) if m else slug
    title = re.sub(r"\s*\|\s*The Award Hacker\s*$", "", title)

    prose_m = re.search(r'<article class="prose">(.*?)</article>', src, re.S | re.I)
    prose = prose_m.group(1) if prose_m else ""

    # Excerpt: first paragraph that is actual body text (skip byline/pubdate)
    excerpt = ""
    for pm in re.finditer(r"<p([^>]*)>(.*?)</p>", prose, re.S | re.I):
        attrs, body = pm.group(1), pm.group(2)
        if re.search(r'class="(byline|pubdate|aff-notice)', attrs):
            continue
        text = clean(body)
        if len(text) >= 40:                       # skip stubs like the tagline
            excerpt = text[:160].rstrip()
            if len(text) > 160:
                excerpt = excerpt.rsplit(" ", 1)[0] + "..."
            break

    # Headings: h2s inside .prose, minus FAQ / Keep reading sections
    prose_no_aux = re.sub(
        r'<(div class="faq"|section class="keep-reading").*?</(div|section)>',
        "", prose, flags=re.S | re.I)
    headings = [clean(h) for h in re.findall(r"<h2[^>]*>(.*?)</h2>", prose_no_aux, re.S | re.I)]
    headings = [h for h in headings if h.lower() not in SKIP_HEADINGS]

    return {
        "title": title,
        "url": "articles/" + slug,
        "excerpt": excerpt,
        "headings": headings,
    }


def main():
    files = sorted(glob.glob(os.path.join(ARTICLES_DIR, "*.html")))
    if not files:
        print("No articles found", file=sys.stderr)
        sys.exit(1)

    index = [parse_article(p) for p in files]

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    # ---- validation ----
    with open(OUT_PATH, encoding="utf-8") as f:
        loaded = json.load(f)                      # raises if not valid JSON
    assert isinstance(loaded, list) and len(loaded) == len(files), \
        "index entry count does not match article count"
    for entry in loaded:
        assert entry["title"] and entry["excerpt"] and entry["url"], \
            "entry missing required fields: %r" % (entry,)
        local = os.path.join(ROOT, entry["url"])
        assert os.path.isfile(local), "URL does not resolve to a local file: " + entry["url"]

    print("Wrote %s with %d entries (validated OK)" % (OUT_PATH, len(loaded)))
    for e in loaded:
        print("  - %s" % e["url"])


if __name__ == "__main__":
    main()
