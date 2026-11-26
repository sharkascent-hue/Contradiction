#!/usr/bin/env python3
"""Build wbw/: the original-language text of every verse, word by word, with an English meaning for each word.

Usage: python3 build_wbw.py <src_dir> <site_dir>

<src_dir> holds:
  tahot-*.txt   STEPBible TAHOT, the Hebrew Old Testament (Leningrad Codex)   CC BY 4.0, Tyndale House Cambridge
  tagnt-*.txt   STEPBible TAGNT, the Greek New Testament (NA28, with TR/Byzantine variants)   CC BY 4.0
                from github.com/STEPBible/STEPBible-Data, folder "Translators Amalgamated OT+NT"
  quran/<n>.json  api.quran.com/api/v4/verses/by_chapter/<n>?words=true&word_fields=text_uthmani&per_page=300
Output, one file per book (Quran: one per surah), English verse numbering:
  wbw/he/<BOOK>.json, wbw/el/<BOOK>.json, wbw/ar/Q<n>.json
  = [chapter][verse] -> [[original, transliteration, English, lexicon form and meaning, Strong's number, flag], ...]
  flag (Greek only): "TR" for words found in the Textus Receptus/KJV tradition but not in the critical NA28 text.
"""
import glob, json, os, re, sys

src, site = sys.argv[1], sys.argv[2]
CODES = dict(zip(
    "Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal "
    "Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev".split(),
    "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL "
    "MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV".split()))
REF = re.compile(r"^([1-3][A-Z][a-z]|[A-Z][a-z]{2})\.(\d+)\.(\d+)(?:\([^)]*\))?#(\d+)=(\S+)$")

def put(books, code, ch, v, word):
    v = max(v, 1)                     # a psalm's title is verse 0 here; English Bibles print it as part of verse 1
    chs = books.setdefault(code, [])
    while len(chs) < ch:
        chs.append([])
    vs = chs[ch - 1]
    while len(vs) < v:
        vs.append([])
    vs[v - 1].append(word)

def lexeme(field):
    """'{H1254A=בָּרָא=to create}' or 'ἐν=in/on/among' -> 'בָּרָא: to create'."""
    m = re.search(r"\{?H?\d*\w*=?([^=/{}]+)=([^}»]+)", field)
    if not m:
        return ""
    form, mean = m.group(1).strip(), re.sub(r"^:\s*", "", m.group(2)).split("»")[0].strip()
    return (form + ": " + mean)[:80]

def hebrew():
    books = {}
    for path in sorted(glob.glob(os.path.join(src, "tahot-*.txt"))):
        for line in open(path, encoding="utf-8-sig"):
            cols = line.rstrip("\n").split("\t")
            m = REF.match(cols[0]) if cols else None
            if not m or len(cols) < 6:
                continue
            book, ch, v, _, kind = m.groups()
            if not (kind.startswith("L") or kind.startswith("Q")):      # Leningrad text and its Qere readings; skip Ketiv duplicates
                continue
            word = cols[1].replace("/", "").replace("\\", "")
            translit = cols[2].replace("/", "").replace(".", "")
            gloss = re.sub(r"\s*/\s*", " ", cols[3]).strip()
            strong = re.sub(r"[{}]", "", cols[4]).split("/")[-1]
            lex = lexeme(cols[10]) if len(cols) > 10 else ""
            put(books, CODES[book], int(ch), int(v), [word, translit, gloss, lex, strong])
    return books

def greek():
    books = {}
    for path in sorted(glob.glob(os.path.join(src, "tagnt-*.txt"))):
        for line in open(path, encoding="utf-8-sig"):
            cols = line.rstrip("\n").split("\t")
            m = REF.match(cols[0]) if cols else None
            if not m or len(cols) < 5:
                continue
            book, ch, v, _, kind = m.groups()
            if "N" not in kind and "K" not in kind:                      # only in minor editions
                continue
            wm = re.match(r"^(\S+)\s*\(([^)]*)\)", cols[1].strip())
            word, translit = (wm.group(1), wm.group(2)) if wm else (cols[1].strip(), "")
            strong = cols[3].split("=")[0]
            row = [word, translit, cols[2].strip(), cols[4].strip()[:80], strong]
            if "N" not in kind:
                row.append("TR")
            put(books, CODES[book], int(ch), int(v), row)
    return books

def quran():
    books = {}
    for n in range(1, 115):
        path = os.path.join(src, "quran", "%d.json" % n)
        if not os.path.exists(path):
            continue
        for verse in json.load(open(path, encoding="utf-8"))["verses"]:
            v = int(verse["verse_key"].split(":")[1])
            for w in verse["words"]:
                if w.get("char_type_name") != "word":
                    continue
                put(books, "Q%d" % n, 1, v, [w.get("text_uthmani", ""), (w.get("transliteration") or {}).get("text") or "",
                                            (w.get("translation") or {}).get("text") or "", "", ""])
    return books

for lang, books in (("he", hebrew()), ("el", greek()), ("ar", quran())):
    d = os.path.join(site, "wbw", lang)
    os.makedirs(d, exist_ok=True)
    words = 0
    for code, chs in books.items():
        words += sum(len(v) for c in chs for v in c)
        with open(os.path.join(d, code + ".json"), "w", encoding="utf-8") as f:
            json.dump(chs, f, ensure_ascii=False, separators=(",", ":"))
    print(lang, len(books), "books", words, "words")
