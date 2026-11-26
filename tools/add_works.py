#!/usr/bin/env python3
"""Add single works (prepared as JSON) to lib/ without rebuilding the whole library.

Usage: python3 add_works.py <site_dir> <work.json>:<id>:<faith>:<collection>[:<note>] ...
work.json = {"title", "author", "edition", "source_url", "licence", "parts": [{"t", "items": [{"n", "e", "h"?}]}]}
Re-adding a work with the same id replaces it.
"""
import json, os, sys

site = sys.argv[1]
lib = os.path.join(site, "lib")
index = json.load(open(os.path.join(lib, "index.json"), encoding="utf-8"))
for spec in sys.argv[2:]:
    path, wid, faith, coll, *note = spec.split(":", 4)
    w = json.load(open(path, encoding="utf-8"))
    d = os.path.join(lib, wid)
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        os.remove(os.path.join(d, f))
    parts, size = [], 0
    for p in w["parts"]:                       # merge small chapters into files of about 90,000 characters
        items = [i for i in p["items"] if i.get("e")]
        if not items:
            continue
        if items and "h" not in items[0]:
            items[0]["h"] = p["t"]
        n = sum(len(i["e"]) for i in items)
        if parts and size + n <= 90000:
            parts[-1][0].append(p["t"]); parts[-1][1].extend(items); size += n
        else:
            parts.append([[p["t"]], items]); size = n
    toc = []
    for k, (names, items) in enumerate(parts):
        title = names[0] if len(names) == 1 else "%s – %s" % (names[0], names[-1])
        json.dump({"t": title, "items": items}, open(os.path.join(d, "%d.json" % k), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        toc.append([title, len(items)] + ([" | ".join(names)[:1500]] if len(names) > 1 else []))
    json.dump(toc, open(os.path.join(d, "toc.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    index = [x for x in index if x["id"] != wid]
    index.append({"id": wid, "t": w["title"], "a": w.get("author", ""), "f": faith, "c": coll, "s": w.get("edition", ""),
                  "l": (note[0] + " " if note else "") + w["licence"], "lang": "", "n": len(parts), "items": sum(len(i) for _, i in parts)})
    print(wid, len(parts), "files", sum(len(i) for _, i in parts), "items")
json.dump(index, open(os.path.join(lib, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
