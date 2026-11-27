#!/usr/bin/env python3
"""Check that every reference and link in content/*.json points at something that exists.

Usage: python3 check_content.py <site_dir>
Checks: Bible and Quran references (chapter and verse exist in at least one edition),
        [[route|label]] links, hadith numbers, Talmud pages, Mishnah passages, topic and comparison slugs.
"""
import json, os, re, sys

site = sys.argv[1]
J = lambda *p: json.load(open(os.path.join(site, *p), encoding="utf-8"))
M, Q, D, B = J("data", "index.json"), J("content", "questions.json"), J("content", "disputes.json"), J("content", "beliefs.json")
G = J("content", "guide.json")
DB = J("content", "debates.json")
SH = J("content", "shamoun.json")
EX = J("content", "extra.json")
ST = J("content", "stories.json")
PR = J("content", "prophecies.json")
TR = J("content", "translations.json")
TL = J("content", "timeline.json")
HQ = J("content", "hard.json")
QZ = J("content", "quiz.json")
QB = J("content", "quizbank.json")
Q2 = J("content", "questions2.json")
lib = {w["id"]: w for w in J("lib", "index.json")}
colls = {w["c"] for w in lib.values()}
questions = Q["questions"] + D["questions"] + Q2["questions"]
qslugs = {q["slug"] for q in questions}
alias = {b["name"].lower(): b["code"] for b in M["books"] if b["group"] != "quran"}
alias.update({"psalm": "PSA", "quran": "Q"})
ref_re = re.compile(r"\b(" + "|".join(sorted(map(re.escape, alias), key=len, reverse=True)) + r")\s(\d+)(?::(\d+)(?:[–-](\d+))?)?", re.I)
HADITH = {"Sahih al-Bukhari": "hadith-bukhari", "Sahih Muslim": "hadith-muslim", "Sunan Abi Dawud": "hadith-abudawud",
          "Jami' at-Tirmidhi": "hadith-tirmidhi", "Sunan an-Nasa'i": "hadith-nasai", "Sunan Ibn Majah": "hadith-ibnmajah", "Muwatta Malik": "hadith-malik"}
hadith_re = re.compile("(" + "|".join(map(re.escape, HADITH)) + r") (\d+)")
TRACT = "Berakhot|Shabbat|Eruvin|Pesachim|Yoma|Sukkah|Beitzah|Rosh Hashanah|Taanit|Megillah|Moed Katan|Chagigah|Yevamot|Ketubot|Nedarim|Nazir|Sotah|Gittin|Kiddushin|Bava Kamma|Bava Metzia|Bava Batra|Sanhedrin|Makkot|Shevuot|Avodah Zarah|Horayot|Zevachim|Menachot|Chullin|Bekhorot|Arakhin|Temurah|Keritot|Meilah|Tamid|Niddah"
talmud_re = re.compile(r"\b(" + TRACT + r") (\d{1,3}[ab])\b")
mishnah_re = re.compile(r"\bMishnah ([A-Z][a-z]+(?: [A-Z][a-z]+)?) (\d+:\d+)")
slug = lambda t: re.sub(r"[^a-z0-9]+", "-", t.lower())
books = {}
def book(tr, code):
    if (tr, code) not in books:
        books[(tr, code)] = J("data", tr, code + ".json")
    return books[(tr, code)]
tocs = {}
def toc(wid):
    if wid not in tocs:
        tocs[wid] = J("lib", wid, "toc.json")
    return tocs[wid]
def go(wid, key):
    """Mirror of go() in app.js."""
    if wid not in lib:
        return False
    k = key.lower()
    if wid.startswith("hadith-") and key in J("lib", wid, "nums.json"):
        return True
    t = toc(wid)
    ch = k.split(":")[0]
    part = next((i for i, p in enumerate(t) if p[0].lower() in (k, "daf " + k, "chapter " + ch) or p[0].lower().startswith(k + ". ")), -1)
    if part < 0:
        part = next((i for i, p in enumerate(t) if len(p) > 2 and k in p[2].lower().split(" | ")), -1)
    if part < 0:
        part = next((i for i, p in enumerate(t) if k in (p[0] + " " + (p[2] if len(p) > 2 else "")).lower()), -1)
    if part >= 0 and ":" in key and not wid.startswith("tafsir"):
        return any(it.get("n") == key for it in J("lib", wid, "%d.json" % part)["items"])
    return part >= 0
def route(path):
    a = path.split("/")
    if a[0] == "lib":
        return (a[1] == "c" and "/".join(a[2:]) in colls) or a[1] in lib
    if a[0] == "go":
        return go(a[1], "/".join(a[2:]))
    if a[0] == "q":
        return a[1] in qslugs
    if a[0] == "books":
        return any(t["id"] == a[1] for t in M["translations"])
    if a[0] == "beliefs":
        return any(t["slug"] == a[1] for t in B["traditions"])
    if a[0] == "topic":
        return any(t["slug"] == a[1] for t in Q["topics"])
    if a[0] == "compare":
        return any(c["slug"] == a[1] for c in B["compare"])
    return False

def strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, list):
        for i in x:
            yield from strings(i)
    elif isinstance(x, dict):
        for v in x.values():
            yield from strings(v)

problems, counts = [], dict(verses=0, links=0, hadith=0, talmud=0)
for name, doc in (("questions", Q), ("questions2", Q2), ("disputes", D), ("beliefs", B), ("guide", G), ("debates", [[t["ref"] for t in a["texts"]] + [a["argument"], a["response"], a["facts"], a["assessment"]] for a in DB["arguments"]]), ("shamoun", [a["texts"] for a in SH["arguments"]] + [x["texts"] for x in SH["debates"]]), ("stories", ST), ("prophecies", PR), ("translations", TR), ("timeline", TL), ("hard", HQ), ("quizbank", [x["ref"] for x in QB["questions"] if x["ref"]]), ("quiz", [[x["ref"] for x in z["questions"] if x["ref"]] for z in QZ["quizzes"]] + [f["ref"] for f in QZ["facts"]])):
    for s in strings(doc):
        for path, label in re.findall(r"\[\[([^|\]]+)\|([^\]]+)\]\]", s):
            counts["links"] += 1
            if not route(path):
                problems.append("%s: broken link [[%s|%s]]" % (name, path, label))
        plain = re.sub(r"\[\[[^\]]+\]\]", " ", s)
        for b, n in hadith_re.findall(plain):
            counts["hadith"] += 1
            if not go(HADITH[b], n):
                problems.append("%s: no such hadith: %s %s" % (name, b, n))
        for t, d in talmud_re.findall(plain):
            counts["talmud"] += 1
            if not go("sef-" + slug(t), d):
                problems.append("%s: no such Talmud page: %s %s" % (name, t, d))
        for t, r in mishnah_re.findall(plain):
            counts["talmud"] += 1
            if not go("sef-pirkei-avot" if slug(t) == "avot" else "sef-mishnah-" + slug(t), r):
                problems.append("%s: no such Mishnah passage: %s %s" % (name, t, r))
        plain = hadith_re.sub(" ", plain)
        for m in ref_re.finditer(plain):
            counts["verses"] += 1
            code = alias[m[1].lower()]
            ch, v = int(m[2]), int(m[4] or m[3] or 1)
            if code == "Q":
                code, ch, v = "Q%d" % ch, 1, int(m[4] or m[3] or 1)
            found = False
            for t in M["translations"]:
                if code in dict(t["books"]):
                    bk = book(t["id"], code)
                    if ch <= len(bk) and v <= len(bk[ch - 1]):
                        found = True
                        break
            if not found:
                problems.append("%s: no such verse: %s" % (name, m[0]))
for t in Q["topics"]:
    for s in t["questions"]:
        if s not in qslugs:
            problems.append("topic %s: unknown question %s" % (t["slug"], s))
for t in G["topics"]:
    for m in t.get("related", []):
        if not route(m):
            problems.append("guide %s: unknown related %s" % (t["id"], m))
for c in B["compare"]:
    for m in c.get("more", []):
        if not route(m):
            problems.append("compare %s: unknown %s" % (c["slug"], m))
for side in EX.values():
    for _, items in side:
        for path, label, _n in items:
            counts["links"] += 1
            if not route(path):
                problems.append("extra: broken link %s" % path)
for t in B["traditions"]:
    for path, label in t["texts"]:
        counts["links"] += 1
        if not route(path):
            problems.append("beliefs %s: broken text link %s" % (t["slug"], path))
for q in questions:
    for sec in q["sections"]:
        if sec["view"] not in Q["views"]:
            problems.append("question %s: unknown view %s" % (q["slug"], sec["view"]))
print(counts)
print("\n".join(problems) if problems else "All references resolve.")
sys.exit(1 if problems else 0)
