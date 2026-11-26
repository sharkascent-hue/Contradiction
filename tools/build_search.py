#!/usr/bin/env python3
"""Build scripture/search/: a word index over the English text of the whole site.

Usage: python3 build_search.py <site_dir>     (the folder holding data/ and lib/)

A "document" is one library part (lib/<work>/<n>.json) or one scripture chapter.
The index maps each word to the documents containing it; the page then opens those
files to show the matching passages. Words are spread over NB bucket files by hash,
so a search downloads one small file per word.

search/meta.json   {nb, stop, works:[[id, firstDoc, parts]], scr:[{tr, first, books:[[code, chapters]]}], docs,
                    len: size of each document in units of 500 characters (for ranking)}
A word that occurs in a document's title or in one of its headings is also indexed as "T" + word,
so the Ask page can prefer the section that is actually about the subject.
search/<bucket>.bin  repeated: [len u8][word][count varint][doc ids, delta-encoded varints]
"""
import array, json, os, re, sys, unicodedata

site = sys.argv[1]
NB = 1024
SCRIPTURE = ["WEB", "PICK"]          # one English edition each of the Bible and the Quran
STOP = set("""a about after again all also am an and any are as at be because been before being but by can could did do does
for from had has have having he her here him his how i if in into is it its may me might more most must my no nor not now of
on one only or other our out shall she should so some such than that the their them then there these they this those thou thy thee
through to unto up upon us very was we were what when where which who whom why will with would ye you your hath said say""".split())
word_re = re.compile(r"[a-z]{2,24}|\d{3,4}")

def norm(s):
    s = unicodedata.normalize("NFKD", s.lower().replace("’", "'"))
    return "".join(c for c in s if not unicodedata.combining(c))

def fnv(w):
    h = 2166136261
    for c in w.encode("ascii"):
        h = ((h ^ c) * 16777619) & 0xFFFFFFFF
    return h % NB

post, lengths = {}, []
def add(doc, text, headings=""):
    lengths.append(min(60000, len(text) // 500))
    words = set(word_re.findall(norm(text)))
    words |= {"T" + w for w in set(word_re.findall(norm(headings))) if w not in STOP}
    for w in words:
        if w in STOP:
            continue
        a = post.get(w)
        if a is None:
            a = post[w] = array.array("I")
        a.append(doc)

doc, works, scr = 0, [], []
for w in json.load(open(os.path.join(site, "lib", "index.json"), encoding="utf-8")):
    works.append([w["id"], doc, w["n"]])
    toc = json.load(open(os.path.join(site, "lib", w["id"], "toc.json"), encoding="utf-8"))
    for n in range(w["n"]):
        part = json.load(open(os.path.join(site, "lib", w["id"], "%d.json" % n), encoding="utf-8"))
        heads = part["t"] + " " + (toc[n][2] if len(toc[n]) > 2 else "") + " " + " ".join(i.get("h", "") for i in part["items"])
        add(doc, " ".join(i.get("e", "") for i in part["items"]) + " " + heads, heads if len(part["items"]) < 400 or len(heads) < 4000 else part["t"])
        doc += 1
man = json.load(open(os.path.join(site, "data", "index.json"), encoding="utf-8"))
for tr in SCRIPTURE:
    t = next(x for x in man["translations"] if x["id"] == tr)
    scr.append({"tr": tr, "first": doc, "books": t["books"]})
    for code, nch in t["books"]:
        chapters = json.load(open(os.path.join(site, "data", tr, code + ".json"), encoding="utf-8"))
        for ch in chapters:
            add(doc, " ".join(ch))
            doc += 1

def varint(n, out):
    while n > 127:
        out.append((n & 127) | 128)
        n >>= 7
    out.append(n)

buckets = [bytearray() for _ in range(NB)]
for w in sorted(post):
    b = buckets[fnv(w)]
    ids = post[w]
    b.append(len(w)); b.extend(w.encode("ascii"))
    varint(len(ids), b)
    prev = 0
    for d in ids:
        varint(d - prev, b); prev = d
out = os.path.join(site, "search")
os.makedirs(out, exist_ok=True)
for i, b in enumerate(buckets):
    with open(os.path.join(out, "%d.bin" % i), "wb") as f:
        f.write(b)
with open(os.path.join(out, "meta.json"), "w") as f:
    json.dump({"nb": NB, "stop": sorted(STOP), "works": works, "scr": scr, "docs": doc, "len": lengths}, f, separators=(",", ":"))
print(doc, "documents,", len(post), "words,", sum(len(b) for b in buckets) // 1000, "KB, largest bucket", max(len(b) for b in buckets) // 1000, "KB")
