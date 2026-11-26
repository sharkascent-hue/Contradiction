#!/usr/bin/env python3
"""Build scripture/lib/ (hadith, Talmud, creeds, Church Fathers) from downloaded sources.

Usage: python3 build_library.py <src_dir> <out_dir>

<src_dir> holds:
  hadith/{eng,ara}-<collection>.json   github.com/fawazahmed0/hadith-api (editions/)
  hadith2/<book>.json                  github.com/AhmedBaset/hadith-json v1.2.0 (db/by_book/)
  thaq/<bookId>.json                   thaqalayn-api.net/api/v2/<bookId>
  tafsir/<edition>/<surah>.json        github.com/spa5k/tafsir_api (tafsir/)
  creeds/*.json                        github.com/NonlinearFruit/Creeds.json (creeds/)
  sefaria/, sefaria2/ + _want*.json    Sefaria export bucket, "merged" English (and Hebrew) versions
  sefaria_lic.json                     licence of every Sefaria version, from sefaria.org/api/v3/texts/<title>
  ws/pages/*.jsonl                     slices of the English Wikisource dump (dumps.wikimedia.org), one page per line
  ccel/*.xml, ccel2/*.xml              ccel.org ThML (Schaff's Fathers and Creeds, Aquinas, Calvin, Luther, Wesley ...)

Output: <out_dir>/index.json            every work
        <out_dir>/<work>/toc.json       [[part title, item count], ...]
        <out_dir>/<work>/<n>.json       {"t": title, "items": [{n,e,o,g,h}, ...]}
        <out_dir>/<work>/nums.json      hadith number -> [part, item] (hadith collections only)
        item keys: n label, e English, o original language, g grading/note, h sub-heading
"""
import collections, glob, html, json, os, re, sys

src, out = sys.argv[1], sys.argv[2]
works = []
skipped = []          # (title, reason) for texts left out on licence grounds

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def add_work(wid, title, faith, coll, parts, author="", sub="", licence="", lang="", numkey=None):
    """parts: list of (title, items). Empty parts are dropped.
    numkey(item) -> list of citation numbers for that item; written to nums.json."""
    split = []                                    # keep every file small enough to load on a phone
    for part in parts:
        t, items, key = part[0], [i for i in part[1] if i.get("e") or i.get("o")], part[2] if len(part) > 2 else ""
        t = t if len(t) <= 170 else t[:167] + "..."
        chunk, size, k = [], 0, 1
        for it in items:
            chunk.append(it)
            size += len(it.get("e", "")) + 2 * len(it.get("o", ""))
            if size > 260000:
                split.append((t if k == 1 else "%s (part %d)" % (t, k), chunk, key))
                chunk, size, k = [], 0, k + 1
        if chunk:
            split.append((t if k == 1 else "%s (part %d)" % (t, k), chunk, key))
    extra = [k for _, _, k in split]              # headings packed inside a part, so links can find them
    parts = [(t, items) for t, items, _ in split]
    if not parts:
        return
    d = os.path.join(out, wid)
    os.makedirs(d, exist_ok=True)
    for n, (t, items) in enumerate(parts):
        with open(os.path.join(d, "%d.json" % n), "w", encoding="utf-8") as f:
            json.dump({"t": t, "items": items}, f, ensure_ascii=False, separators=(",", ":"))
    if numkey:
        nums = {}
        for n, (t, items) in enumerate(parts):
            for i, it in enumerate(items):
                for k in numkey(it):
                    nums.setdefault(k, [n, i])
        with open(os.path.join(d, "nums.json"), "w", encoding="utf-8") as f:
            json.dump(nums, f, separators=(",", ":"))
    with open(os.path.join(d, "toc.json"), "w", encoding="utf-8") as f:
        json.dump([[t, len(items)] + ([extra[n]] if extra[n] else []) for n, (t, items) in enumerate(parts)], f, ensure_ascii=False, separators=(",", ":"))
    works.append({"id": wid, "t": title, "a": author, "f": faith, "c": coll, "s": sub, "l": licence, "lang": lang,
                  "n": len(parts), "items": sum(len(i) for _, i in parts)})

def item(**kw):
    return {k: v for k, v in kw.items() if v}

def ws(s):
    return " ".join((s or "").split())

# ---------------------------------------------------------------- Sunni hadith
SUNNI = [
 ("bukhari", "Sahih al-Bukhari", "Muhammad al-Bukhari (d. 870)"),
 ("muslim", "Sahih Muslim", "Muslim ibn al-Hajjaj (d. 875)"),
 ("abudawud", "Sunan Abi Dawud", "Abu Dawud al-Sijistani (d. 889)"),
 ("tirmidhi", "Jami' at-Tirmidhi", "Muhammad at-Tirmidhi (d. 892)"),
 ("nasai", "Sunan an-Nasa'i", "Ahmad an-Nasa'i (d. 915)"),
 ("ibnmajah", "Sunan Ibn Majah", "Ibn Majah (d. 887)"),
 ("malik", "Muwatta Malik", "Malik ibn Anas (d. 795)"),
 ("nawawi", "Forty Hadith of an-Nawawi", "Yahya an-Nawawi (d. 1277)"),
 ("qudsi", "Forty Hadith Qudsi", ""),
 ("dehlawi", "Forty Hadith of Shah Waliullah", "Shah Waliullah Dehlawi (d. 1762)"),
]
HL = ("Arabic text is not under copyright. English translation taken from the open fawazahmed0/hadith-api dataset; "
      "the translator's rights have not been verified and must be cleared before public use.")

def sunni():
    for key, title, author in SUNNI:
        en = json.load(open(f"{src}/hadith/eng-{key}.json", encoding="utf-8"))
        ar = {h["hadithnumber"]: h["text"] for h in json.load(open(f"{src}/hadith/ara-{key}.json", encoding="utf-8"))["hadiths"]}
        names = en["metadata"]["sections"]
        parts = collections.OrderedDict()
        ranges = [(int(k), v["hadithnumber_first"], v["hadithnumber_last"]) for k, v in en["metadata"].get("section_details", {}).items() if int(k)]
        for h in en["hadiths"]:
            book = h.get("reference", {}).get("book", 0)
            if not book:                               # no chapter recorded: place it by its number
                book = next((k for k, a, b in ranges if a <= h["hadithnumber"] <= b), 0)
            grades = "; ".join("%s (%s)" % (g["grade"], g["name"]) for g in h.get("grades", []))
            n = str(h["hadithnumber"])
            if key == "muslim":      # Sahih Muslim is cited by the Arabic numbering (1422), not the English one (3479)
                n = "%s (English ref. %s)" % (h.get("arabicnumber"), h["hadithnumber"])
            elif h.get("arabicnumber") not in (None, h["hadithnumber"]):
                n += " (Arabic no. %s)" % h["arabicnumber"]
            parts.setdefault(book, []).append(item(n=n, e=ws(h["text"]), o=ws(ar.get(h["hadithnumber"], "")), g=grades))
        add_work("hadith-" + key, title, "islam", "Sunni hadith",
                 [(ws(names.get(str(b), "")) or ("Book %s" % b if b else "Other hadith"), items) for b, items in sorted(parts.items(), key=lambda kv: kv[0] or 10 ** 6)],
                 author=author, licence=HL, lang="ar",
                 sub="Forty-hadith collections" if key in ("nawawi", "qudsi", "dehlawi") else "The six books and the Muwatta",
                 numkey=lambda it: [re.match(r"\d+", it["n"]).group(0)] if re.match(r"\d+", it.get("n", "")) else [])

SUNNI2 = [("ahmed", "Musnad Ahmad (partial)", "Ahmad ibn Hanbal (d. 855)"), ("darimi", "Sunan ad-Darimi", "Abdullah ad-Darimi (d. 869)"),
          ("riyad_assalihin", "Riyad as-Salihin", "Yahya an-Nawawi (d. 1277)"), ("bulugh_almaram", "Bulugh al-Maram", "Ibn Hajar al-Asqalani (d. 1449)"),
          ("aladab_almufrad", "Al-Adab al-Mufrad", "Muhammad al-Bukhari (d. 870)"), ("mishkat_almasabih", "Mishkat al-Masabih", "al-Khatib at-Tabrizi (d. 1340)"),
          ("shamail_muhammadiyah", "Shama'il Muhammadiyah", "Muhammad at-Tirmidhi (d. 892)")]

def sunni2():
    for key, title, author in SUNNI2:
        path = f"{src}/hadith2/{key}.json"
        if not os.path.exists(path):
            continue
        d = json.load(open(path, encoding="utf-8"))
        chap = {c["id"]: ws(c.get("english")) or ws(c.get("arabic")) for c in d.get("chapters", [])}
        parts = collections.OrderedDict()
        for h in d["hadiths"]:
            en = h.get("english") or {}
            text = ws((en.get("narrator") or "") + " " + (en.get("text") or ""))
            parts.setdefault(h.get("chapterId"), []).append(item(n=str(h.get("idInBook", "")), e=text, o=ws(h.get("arabic"))))
        add_work("hadith-" + slug(key), title, "islam", "Sunni hadith",
                 [(chap.get(c) or "Section %s" % c, items) for c, items in parts.items()], author=author, sub="Further collections",
                 licence=HL.replace("fawazahmed0/hadith-api", "AhmedBaset/hadith-json"), lang="ar",
                 numkey=lambda it: [it["n"]] if it.get("n") else [])

# ---------------------------------------------------------------- Quran commentary
SURAHS = None
TAFSIR = [
 ("tafsir-al-jalalayn", "tafsir-jalalayn", "Tafsir al-Jalalayn", "al-Mahalli (d. 1459) and as-Suyuti (d. 1505)", "e", "Sunni", "Translated by Feras Hamza for the Royal Aal al-Bayt Institute, which offers it free for non-commercial use; terms not re-verified here."),
 ("en-tafsir-ibn-abbas", "tafsir-ibn-abbas", "Tanwir al-Miqbas (attributed to Ibn Abbas)", "attributed to Ibn Abbas (d. 687)", "e", "Sunni", "Translated by Mokrane Guezzou for the Royal Aal al-Bayt Institute, which offers it free for non-commercial use; terms not re-verified here."),
 ("en-asbab-al-nuzul-by-al-wahidi", "tafsir-asbab-al-nuzul", "Asbab al-Nuzul (occasions of revelation)", "al-Wahidi (d. 1075)", "e", "Sunni", "Translated by Mokrane Guezzou for the Royal Aal al-Bayt Institute, which offers it free for non-commercial use; terms not re-verified here."),
 ("en-tafisr-ibn-kathir", "tafsir-ibn-kathir", "Tafsir Ibn Kathir (abridged)", "Ibn Kathir (d. 1373)", "e", "Sunni", "Modern abridged English translation; rights not verified and must be cleared before public use."),
 ("en-tafsir-maarif-ul-quran", "tafsir-maarif-ul-quran", "Ma'arif al-Qur'an", "Muhammad Shafi (d. 1976)", "e", "Sunni", "Modern work; rights not verified and must be cleared before public use."),
 ("en-tafsir-al-mukhtasar", "tafsir-mukhtasar", "Al-Mukhtasar", "Tafsir Center for Quranic Studies", "e", "Sunni", "Modern work; rights not verified and must be cleared before public use."),
 ("en-tazkirul-quran", "tafsir-tazkirul-quran", "Tazkirul Quran", "Wahiduddin Khan (d. 2021)", "e", "Sunni", "Modern work; rights not verified and must be cleared before public use."),
 ("ar-tafsir-al-jalalayn", "tafsir-jalalayn-arabic", "Tafsir al-Jalalayn (Arabic)", "al-Mahalli and as-Suyuti", "o", "Arabic", "The Arabic text is not under copyright."),
 ("ar-tafsir-al-tabari", "tafsir-tabari-arabic", "Tafsir al-Tabari (Arabic)", "Ibn Jarir al-Tabari (d. 923)", "o", "Arabic", "The Arabic text is not under copyright."),
 ("ar-tafsir-ibn-kathir", "tafsir-ibn-kathir-arabic", "Tafsir Ibn Kathir (Arabic, complete)", "Ibn Kathir (d. 1373)", "o", "Arabic", "The Arabic text is not under copyright."),
 ("ar-tafseer-al-qurtubi", "tafsir-qurtubi-arabic", "Tafsir al-Qurtubi (Arabic)", "al-Qurtubi (d. 1273)", "o", "Arabic", "The Arabic text is not under copyright."),
 ("ar-tafsir-al-baghawi", "tafsir-baghawi-arabic", "Tafsir al-Baghawi (Arabic)", "al-Baghawi (d. 1122)", "o", "Arabic", "The Arabic text is not under copyright."),
 ("tafsir-al-razi", "tafsir-razi-arabic", "Tafsir al-Razi, Mafatih al-Ghayb (Arabic)", "Fakhr al-Din al-Razi (d. 1210)", "o", "Arabic", "The Arabic text is not under copyright."),
 ("al-kashshaf-al-zamakhshari", "tafsir-zamakhshari-arabic", "Al-Kashshaf (Arabic)", "al-Zamakhshari (d. 1144)", "o", "Arabic", "The Arabic text is not under copyright."),
 ("tafsir-al-baydawi", "tafsir-baydawi-arabic", "Tafsir al-Baydawi (Arabic)", "al-Baydawi (d. 1286)", "o", "Arabic", "The Arabic text is not under copyright."),
 ("ar-tafseer-al-saddi", "tafsir-sadi-arabic", "Tafsir al-Sa'di (Arabic)", "Abd al-Rahman al-Sa'di (d. 1957)", "o", "Arabic", "Arabic work whose author died in 1957; rights not verified."),
 ("ar-tafsir-muyassar", "tafsir-muyassar-arabic", "Tafsir al-Muyassar (Arabic)", "King Fahd Complex", "o", "Arabic", "Modern Arabic work; rights not verified."),
]

def tafsir():
    names = [b["name"] for b in json.load(open(os.path.join(os.path.dirname(out.rstrip("/")), "data", "index.json"), encoding="utf-8"))["books"] if b["group"] == "quran"]
    for ed, wid, title, author, field, sub, lic in TAFSIR:
        parts = []
        for s in range(1, 115):
            path = f"{src}/tafsir/{ed}/{s}.json"
            if not os.path.exists(path):
                continue
            try:
                d = json.load(open(path, encoding="utf-8"))
            except ValueError:
                continue
            rows = d["ayahs"] if isinstance(d, dict) else d
            items, prev = [], None
            for a in rows:
                text = ws(re.sub(r"[_*#]{1,3}", " ", a.get("text") or ""))
                if not text:
                    continue
                if text == prev:                       # one comment covering a run of verses
                    first = items[-1]["n"].split(":")[1].split("–")[0]
                    items[-1]["n"] = "%s:%s–%s" % (s, first, a["ayah"])
                    continue
                items.append({"n": "%s:%s" % (s, a["ayah"]), field: text})
                prev = text
            parts.append((names[s - 1], items))
        add_work(wid, title, "islam", "Quran commentary (tafsir)", parts, author=author, sub=sub,
                 licence=lic + " Text via the open spa5k/tafsir_api dataset.", lang="ar" if field == "o" else "")

# ---------------------------------------------------------------- Shia hadith
def shia():
    for b in json.load(open(f"{src}/probe_thaq.json", encoding="utf-8")):
        path = f"{src}/thaq/{b['bookId']}.json"
        if not os.path.exists(path):
            continue
        rows = json.load(open(path, encoding="utf-8"))
        if not isinstance(rows, list):
            continue
        parts, last = collections.OrderedDict(), None
        for h in rows:
            cat = ws(h.get("category")) or "Text"
            ch = ws(h.get("chapter"))
            grade = ws(h.get("majlisiGrading"))
            items = parts.setdefault(cat, [])
            items.append(item(n=str(h.get("id", "")), e=ws(h.get("englishText")), o=ws(h.get("arabicText")),
                              g=("Majlisi: " + grade) if grade and grade != "None" else "",
                              h=ch if (cat, ch) != last and ch != cat else ""))
            last = (cat, ch)
        vol = re.search(r"Volume-(\d+)", b["bookId"])
        title = ws(b["BookName"]) + (", volume " + vol.group(1) if vol else "")
        add_work("shia-" + slug(b["bookId"]), title, "islam", "Shia hadith and teachings", list(parts.items()),
                 author=ws(b.get("author")),
                 licence="Arabic text is not under copyright. English translation by %s, taken from the open thaqalayn-api.net "
                         "dataset; the translator's rights have not been verified and must be cleared before public use."
                         % ws(b.get("translator")), lang="ar")

# ---------------------------------------------------------------- creeds
CREED_SKIP = {"chicago_statement_on_biblical_inerrancy", "christ_hymn_of_colossians", "christ_hymn_of_philippians",
              "christian_shema", "confession_of_peter", "helvetic_consensus", "savoy_declaration", "shema_yisrael"}
CREED_GROUP = [
 (r"apostles|nicene|athanasian|chalced|orange|constantinop|ephesus|nicaea|ignatius|irenaeus|tertullian|gregory|hippolytus", "Early creeds and councils (shared)"),
 (r"augsburg|luther|smalcald|concord", "Lutheran"),
 (r"thirty|39|anglican|lambeth|irish", "Anglican"),
 (r"baptist|keach|abstract|new_hampshire|schleitheim|waldens|puritan|spurgeon", "Baptist and free church"),
]

def creed_items(data):
    """Flatten the Creeds.json shapes (creed, canon, confession, catechism) into (part title, items)."""
    if isinstance(data, dict):
        data = [data]
    flat, chaptered = [], []
    for x in data:
        if "Sections" in x:
            t = "Chapter %s" % x.get("Chapter", "") + (": " + x["Title"] if x.get("Title") else "")
            chaptered.append((t, [item(n="%s.%s" % (x.get("Chapter", ""), s.get("Section", "")), e=ws(s.get("Content"))) for s in x["Sections"]]))
        elif "Question" in x:
            flat.append(item(n="Q. %s" % x.get("Number", ""), h=ws(x["Question"]), e=ws(x.get("Answer"))))
            for sq in x.get("SubQuestions") or []:
                flat.append(item(n="%s.%s" % (x.get("Number", ""), sq.get("Number", "")), h=ws(sq.get("Question")), e=ws(sq.get("Answer"))))
        else:
            paras = [p for p in re.split(r"\n\s*\n", x.get("Content") or "") if p.strip()]
            for i, p in enumerate(paras):
                flat.append(item(n=str(x.get("Article", "")) if i == 0 else "", h=ws(x.get("Title")) if i == 0 else "", e=ws(p)))
    return chaptered or [("Text", flat)]

def creeds():
    for path in sorted(glob.glob(f"{src}/creeds/*.json")):
        key = os.path.basename(path)[:-5]
        if key in CREED_SKIP:
            continue
        c = json.load(open(path, encoding="utf-8"))
        m = c["Metadata"]
        group = next((g for rx, g in CREED_GROUP if re.search(rx, key)), "Reformed and Presbyterian")
        add_work("creed-" + slug(key), "%s (%s)" % (m["Title"], m.get("Year", "")), "christian", "Creeds, confessions and catechisms",
                 creed_items(c["Data"]), author=", ".join((m.get("Authors") or [])[:3]), sub=group,
                 licence="%s. Text via NonlinearFruit/Creeds.json." % (m.get("SourceAttribution") or "Public domain"))

# ---------------------------------------------------------------- Sefaria
def strip_html(s):
    if "<" not in s and "&" not in s:
        return ws(s)
    s = re.sub(r'<sup class="footnote-marker">.*?</sup>', "", s)
    while True:                                   # drop <i class="footnote">…</i>, which nests other <i>
        a = s.find('<i class="footnote"')
        if a < 0:
            break
        depth, pos = 0, a
        for m in re.finditer(r"<(/?)i\b[^>]*>", s[a:]):
            depth += -1 if m.group(1) else 1
            if depth == 0:
                pos = a + m.end()
                break
        else:
            pos = len(s)
        s = s[:a] + s[pos:]
    s = re.sub(r"</?(b|strong)\b[^>]*>", "**", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return ws(html.unescape(s)).replace("** **", " ").replace("****", "")

EN_WORDS = set("the of and to in that is it for with as he his be not was which by this are from they you shall have but one all were will who their said when".split())
FOREIGN_WORDS = set("le la les des et est dans que qui une pour pas sur il ne au du ce cette sont nous vous elle "       # French
                    "não os uma para com em um se na ao dos das mas foi ele ela são como mais seu sua "                 # Portuguese
                    "der die das und ist nicht zu den von mit sich auf für ein eine dem wird auch er sie wie "          # German
                    "el los las y en por con del al lo su es como más pero sus le ya este".split())                     # Spanish

def not_english(text):
    """True for a passage in French, Portuguese, German or Spanish that Sefaria used to fill a gap in its English."""
    words = re.findall(r"[a-zà-ÿ]+", text.lower())
    if len(words) < 8:
        return False
    en = sum(w in EN_WORDS for w in words) / len(words)
    other = sum(w in FOREIGN_WORDS for w in words) / len(words)
    return other > 0.18 and en < 0.06

def amud(i):
    return "%d%s" % (i // 2 + 1, "ab"[i % 2])

SEF_COLL = {"Mishnah": "Mishnah", "Bavli": "Babylonian Talmud", "Yerushalmi": "Jerusalem Talmud",
            "Mishneh Torah": "Mishneh Torah (Maimonides)", "Rashi": "Commentaries on the Hebrew Bible"}
SEF_OPEN = {"CC0", "Public Domain", "PD", "CC-BY", "CC-BY-SA", "CC-BY-NC", "CC-BY-NC-SA"}
_lic = None

def sef_licence(title, en):
    """Licence line for a merged Sefaria text, or None when its main English version has no open licence on record."""
    global _lic
    if _lic is None:
        p = f"{src}/sefaria_lic.json"
        _lic = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
    vers = [v[0] for v in en.get("versions", [])]
    lic = [(_lic.get(title, {}).get(v) or "").strip() for v in vers]
    lic = ["CC0" if v == "Sefaria Community Translation" else l for v, l in zip(vers, lic)]   # Sefaria's own terms for these
    def by_age(v, l):                                  # an edition printed before 1930 is public domain
        years = [int(y) for y in re.findall(r"\b(1[5-9]\d\d)\b", v)]
        return "Public Domain" if l not in SEF_OPEN and years and max(years) < 1930 else l
    lic = [by_age(v, l) for v, l in zip(vers, lic)]
    main = next((i for i, v in enumerate(vers) if not re.search(r"\[[a-z]{2}\]$", v)), None)  # first version that is English
    if main is None or lic[main] not in SEF_OPEN:
        skipped.append((title, "Sefaria: main English version '%s' has no open licence on record" % (vers[main] if main is not None else "none")))
        return None
    return "Via Sefaria. English versions used: " + "; ".join("%s (%s)" % (v, l if l in SEF_OPEN else "licence not stated") for v, l in zip(vers, lic)) + \
        ". Texts marked NC may not be used commercially."

def sefaria():
    want = json.load(open(f"{src}/sefaria/_want.json", encoding="utf-8"))
    files = {}
    for x in want:
        name = "__".join(x["categories"] + [x["title"], x["language"]]).replace("/", "-")
        files[(x["title"], x["language"])] = (x, f"{src}/sefaria/{name}.json")
    for (title, lang), (x, path) in files.items():
        if lang != "English" or not os.path.exists(path):
            continue
        en = json.load(open(path, encoding="utf-8"))
        he = None
        if (title, "Hebrew") in files and os.path.exists(files[(title, "Hebrew")][1]):
            he = json.load(open(files[(title, "Hebrew")][1], encoding="utf-8"))["text"]
        lic = sef_licence(title, en)
        if not lic:
            continue
        cats = x["categories"]
        kind = "Rashi" if title.startswith("Rashi") else cats[1] if cats[0] in ("Talmud", "Halakhah") else "Mishnah"
        talmud = kind == "Bavli"
        parts = []
        for i, sec in enumerate(en["text"]):
            if not sec:
                continue
            hsec = he[i] if he and i < len(he) else []
            label = amud(i) if talmud else str(i + 1)
            items = []
            for j, seg in enumerate(sec):
                if isinstance(seg, list):          # chapter > halakhah/verse > segments
                    for k, s2 in enumerate(seg):
                        if isinstance(s2, str) and s2.strip() and not not_english(s2):
                            items.append(item(n="%s:%d" % (label, j + 1) if k == 0 else "", e=strip_html(s2)))
                elif isinstance(seg, str) and seg.strip():
                    o = hsec[j] if j < len(hsec) and isinstance(hsec[j], str) else ""
                    items.append(item(n="%s:%d" % (label, j + 1), e="" if not_english(seg) else strip_html(seg), o=strip_html(o)))
            parts.append((("Daf " if talmud else "Chapter ") + label, items))
        add_work("sef-" + slug(title), title, "judaism", SEF_COLL[kind], parts,
                 sub=cats[-1] if kind != "Rashi" else "Rashi", licence=lic, lang="he" if he else "")

SEF2_COLL = [("Tosefta", "Tosefta"), ("Midrash", "Midrash"), ("Halakhah / Shulchan Arukh", "Shulchan Arukh"),
             ("Halakhah / Sifrei Mitzvot", "Books of the commandments"), ("Jewish Thought", "Jewish thought"),
             ("Kabbalah", "Kabbalah (Zohar, Sefer Yetzirah)"), ("Liturgy", "Jewish liturgy"), ("Musar", "Musar (ethics)"),
             ("Second Temple", "Second Temple writings (Josephus, Philo, Apocrypha)"), ("Tanakh / Targum", "Targum (Aramaic Bible translations)"),
             ("Tanakh / Rishonim on Tanakh", "Commentaries on the Hebrew Bible"), ("Mishnah / Rishonim on Mishnah", "Commentaries on the Mishnah"),
             ("Talmud / Bavli", "Babylonian Talmud")]

def sef_leaves(node, labels):
    """Yield (labels, [strings]) for every list of text segments in a nested Sefaria text."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from sef_leaves(v, labels + [k])
    elif isinstance(node, list):
        strings = [x for x in node if isinstance(x, str) and x.strip()]
        if strings:
            yield labels, strings
        for i, x in enumerate(node):
            if isinstance(x, (list, dict)):
                yield from sef_leaves(x, labels + [i + 1])

def sefaria2():
    wp = f"{src}/sefaria/_want2.json"
    if not os.path.exists(wp):
        return
    for x in json.load(open(wp, encoding="utf-8")):
        name = "__".join(x["categories"] + [x["title"], x["language"]]).replace("/", "-")
        path = f"{src}/sefaria2/{name}.json"
        if not os.path.exists(path):
            continue
        try:
            en = json.load(open(path, encoding="utf-8"))
        except ValueError:
            continue
        title, cats = x["title"], x["categories"]
        lic = sef_licence(title, en)
        if not lic:
            continue
        cpath = " / ".join(cats)
        coll = next(c for p, c in SEF2_COLL if cpath.startswith(p))
        sec0 = (en.get("sectionNames") or ["Section"])[0]
        daf = sec0 == "Daf"
        groups = collections.OrderedDict()
        for labels, strings in sef_leaves(en.get("text"), []):
            first = labels[0] if labels else "Text"
            if isinstance(first, int):
                first = ("Daf " + amud(first - 1)) if daf else "%s %d" % (sec0, first)
            ref = ":".join(str(l) for l in labels)
            g = groups.setdefault(first, [])
            for i, s in enumerate(strings):
                if not_english(s):
                    continue
                n = (ref + (":" if ref else "") + str(i + 1)) if len(labels) <= 1 else (ref if i == 0 else "")
                g.append(item(n=n, e=strip_html(s)))
        parts, cur, names, size = [], [], [], 0       # pack small sections together to keep the file count down
        def flush():
            if cur:
                parts.append((names[0] if len(names) == 1 else "%s – %s" % (names[0], names[-1]), list(cur)))
        for gname, items in groups.items():
            gsize = sum(len(i.get("e", "")) for i in items)
            if cur and size + gsize > 80000:
                flush(); cur.clear(); names.clear(); size = 0
            if items:
                if cur or len(groups) > 1:
                    items[0] = dict(items[0], h=str(gname))
                cur.extend(items); names.append(str(gname)); size += gsize
        flush()
        sub = cats[2] if len(cats) > 2 else (cats[1] if len(cats) > 1 else "")
        add_work("sef-" + slug(title), title, "judaism", coll, parts, sub=sub, licence=lic)

# ---------------------------------------------------------------- Wikisource
KEEP_ARG = {"sc", "smaller", "larger", "center", "c", "right", "left", "block center", "uc", "lc", "asc", "small-caps", "fine", "fine block", "x-smaller",
            "x-larger", "xx-larger", "smaller block", "larger block", "sm", "fs", "lang", "greek", "polytonic", "hebrew", "tooltip", "nowrap", "hi", "hanging indent",
            "outdent", "blackletter", "italic block", "bold", "u", "sp", "ls", "lsp", "justify", "rh", "fqm", "di", "dropinitial", "wikt", "plainlist", "reconstruct"}

def wiki_template(m):
    parts = m.group(1).split("|")
    name = parts[0].strip().lower()
    args = [a for a in parts[1:] if not re.match(r"\s*[\w -]+\s*=", a)]
    if name == "hwe":                                   # second half of a word hyphenated across pages: give the whole word
        return args[1] if len(args) > 1 else ""
    if name in ("gap", "em", "nbsp"):
        return " "
    if name in ("dhr", "rule", "bar", "nop", "clear", "ppb", "pbr"):
        return "\n\n" if name in ("dhr", "ppb", "pbr") else ""
    if name in ("tooltip", "wikt", "sic"):
        return args[0] if args else ""
    if name in KEEP_ARG or name.startswith(("font-size", "float ")):
        return args[-1] if args else ""
    return ""

def wiki_clean(t):
    """Wikitext -> list of (heading or '', paragraph)."""
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"<noinclude>.*?</noinclude>", "", t, flags=re.S)
    t = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    t = re.sub(r"\{\|.*?\|\}", "", t, flags=re.S)                         # tables
    for _ in range(10):
        new = re.sub(r"\{\{([^{}]*)\}\}", wiki_template, t)
        if new == t:
            break
        t = new
    t = re.sub(r"\[\[(?:File|Image|Category):[^\]]*\]\]", "", t, flags=re.I)
    t = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", t)
    t = re.sub(r"^\s*(={2,})\s*(.*?)\s*\1\s*$", r"\n\n@@H@@\2\n\n", t, flags=re.M)        # == Heading ==
    t = re.sub(r"^\s*'{3}([^'\n]{2,90})'{3}\s*$", r"\n\n@@H@@\1\n\n", t, flags=re.M)       # a bold line on its own
    t = re.sub(r"'{2,}", "", t)
    t = re.sub(r"<br\s*/?>|</?(?:dd|dt|dl|li|ul|ol|p|div|poem|section)[^>]*>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    out, head = [], ""
    for para in re.split(r"\n\s*\n", t):
        para = ws(re.sub(r"^[:*#;]+\s*", "", para, flags=re.M))
        if para.startswith("@@H@@"):
            head = para[5:].strip()
        elif len(para) > 1:
            out.append((head, para))
            head = ""
    return out

def wiki_load(*names):
    rows = {}
    for n in names:
        path = f"{src}/ws/pages/{n}.jsonl"
        if os.path.exists(path):
            for line in open(path, encoding="utf-8"):
                r = json.loads(line)
                rows[r["title"]] = html.unescape(r["text"])           # undo the XML escaping of the dump
    return rows

def wiki_expand(text, pages):
    """Replace <pages index=... from=.. to=.. fromsection=.. tosection=.. /> with the text of those scanned pages."""
    def sub(m):
        a = dict((k.lower(), v.strip('"')) for k, v in re.findall(r'(\w+)\s*=\s*("[^"]*"|[^\s/>]+)', m.group(1)))
        if not a.get("index") or not a.get("from", "").isdigit():
            return ""
        first = int(a["from"])
        last = int(a["to"]) if a.get("to", "").isdigit() else first
        index = a["index"].replace("_", " ")
        chunks = []
        for n in range(first, last + 1):
            pg = pages.get("Page:%s/%d" % (index, n), "")
            pg = re.sub(r"<noinclude>.*?</noinclude>", "", pg, flags=re.S)
            only = a.get("onlysection")
            fs, ts = a.get("fromsection"), a.get("tosection")
            if only or (fs and fs == ts):                  # one labelled article, possibly running over several pages
                label = re.escape(only or fs)
                got = re.findall(r'<section\s+begin\s*=\s*"?%s"?\s*/?>(.*?)<section\s+end\s*=\s*"?%s"?\s*/?>' % (label, label), pg, flags=re.S)
                pg = " ".join(got)
            else:
                if fs and n == first:
                    m2 = re.search(r'<section\s+begin\s*=\s*"?%s"?\s*/?>' % re.escape(fs), pg)
                    pg = pg[m2.end():] if m2 else pg
                if ts and n == last:
                    m2 = re.search(r'<section\s+end\s*=\s*"?%s"?\s*/?>' % re.escape(ts), pg)
                    pg = pg[:m2.start()] if m2 else pg
            chunks.append(pg.strip())
        return "\n" + " ".join(c for c in chunks if c) + "\n"
    return re.sub(r"<pages\s+([^>]*?)/?>(?:\s*</pages>)?", sub, text, flags=re.S)

WS_LIC = "Public domain text, from the English Wikisource transcription (CC BY-SA for any editorial additions)."

def pack(entries, limit=90000):
    """entries: [(name, items)] -> parts of about `limit` characters, titled by the first and last name inside."""
    parts, cur, names, size = [], [], [], 0
    def flush():
        if cur:
            parts.append((names[0] if len(names) == 1 else "%s – %s" % (names[0], names[-1]), list(cur), " | ".join(names)[:1500]))
    for name, items in entries:
        n = sum(len(i.get("e", "")) for i in items)
        if cur and size + n > limit:
            flush(); cur.clear(); names.clear(); size = 0
        cur.extend(items); names.append(name); size += n
    flush()
    return parts

def roman(r):
    vals = {"I": 1, "V": 5, "X": 10, "L": 50}
    return sum(-vals[c] if i + 1 < len(r) and vals[c] < vals[r[i + 1]] else vals[c] for i, c in enumerate(r))

CE_RANGE = ["Aachen to Assize", "Assizes to Browne", "Brownson to Clairvaux", "Clandestinity to Diocesan Chancery", "Diocese to Fathers of Mercy",
            "Fathers of the Church to Gregory XI", "Gregory XII to Infallibility", "Infamy to Lapparent", "Laprade to Mass Liturgy", "Mass Music to Newman",
            "New Mexico to Philip", "Philip II to Reuss", "Revelation to Simon Stock", "Simony to Tournon", "Tournely to Zwirner", "supplement"]

def wikisource():
    arts = wiki_load("Catholic_Encyclopedia_1913_")
    if not arts:
        return
    pages = wiki_load("Page_Catholic_Encyclopedia_volume")
    redirect = lambda text: text.lstrip().lower().startswith("#redirect")
    def body(text):
        text = wiki_expand(text, pages)
        return wiki_clean(re.sub(r"^\s*(\{\{[^{}]*\}\}\s*)+", "", text))      # drop the header templates at the top
    # Catholic Encyclopedia: one work per volume, articles in alphabetical order
    vols, nxt = collections.defaultdict(list), {}
    for title, text in arts.items():
        if not title.startswith("Catholic Encyclopedia (1913)/") or redirect(text):
            continue
        name = title.split("/", 1)[1]
        m = re.search(r"\|\s*volume\s*=\s*(\d+)", text)
        by = re.search(r"\|\s*contributor\s*=\s*([^|}\n]+)", text)
        paras = body(text)
        if not m or not paras or sum(len(p) for _, p in paras) < 80:
            continue
        label = name + (" (by %s)" % ws(by.group(1)) if by and ws(by.group(1)) else "")
        nx = re.search(r"\|\s*next\s*=\s*([^|}\n]+)", text)
        nxt[name] = ws(re.sub(r"[\[\]]|\.\./|/$", "", nx.group(1))) if nx else ""
        vols[int(m.group(1))].append((name, [item(e=p, h=label if i == 0 else h) for i, (h, p) in enumerate(paras)]))
    for v in sorted(vols):
        if 1 <= v <= 16:
            # Article titles are natural names ("Abbey of Cluny"), so alphabetical order is not the printed order:
            # follow each article's "next" link, starting from those nothing points to.
            by_name = dict(vols[v])
            pointed = {nxt.get(n) for n in by_name}
            entries, seen = [], set()
            for start in sorted((n for n in by_name if n not in pointed), key=str.lower) + sorted(by_name, key=str.lower):
                n = start
                while n in by_name and n not in seen:
                    seen.add(n); entries.append((n, by_name[n])); n = nxt.get(n)
            add_work("ce-vol-%02d" % v, "Catholic Encyclopedia, volume %d: %s" % (v, CE_RANGE[v - 1]), "christian", "Catholic Encyclopedia (1913)",
                     pack(entries), author="ed. Charles Herbermann and others, 1907–1913", licence=WS_LIC)
    # Easton's Bible Dictionary: one work, entries in alphabetical order
    eas = sorted(((t.split("/", 1)[1], body(x)) for t, x in arts.items() if t.startswith("Easton's Bible Dictionary (1897)/") and not redirect(x)), key=lambda e: e[0].lower())
    eas = [(n, [item(e=p, h=n if i == 0 else h) for i, (h, p) in enumerate(ps)]) for n, ps in eas if ps and len(n) > 1]
    add_work("easton-bible-dictionary", "Easton's Bible Dictionary", "christian", "Protestant theology", pack(eas), author="Matthew George Easton, 1897", sub="Reference", licence=WS_LIC)
    # Three books whose chapters are sub-pages
    for prefix, wid, title, author, coll, sub in [
            ("Canons and Decrees of the Council of Trent/", "trent-canons-and-decrees", "Canons and Decrees of the Council of Trent (English)", "Council of Trent, 1545–1563; translated by T. A. Buckley, 1851", "Catholic theology", "Councils and catechisms"),
            ("The Catechism of the Council of Trent/", "trent-catechism", "Catechism of the Council of Trent (Roman Catechism)", "published by order of Pius V, 1566; translated by J. Donovan, 1829", "Catholic theology", "Councils and catechisms"),
            ("Book of Common Prayer (1892)/", "book-of-common-prayer-1892", "Book of Common Prayer (selections)", "Church of England and Protestant Episcopal Church", "Protestant theology", "Anglican")]:
        parts = []
        for t, text in arts.items():
            if t.startswith(prefix) and not redirect(text):
                paras = body(text)
                if paras and sum(len(p) for _, p in paras) > 60:
                    parts.append((t[len(prefix):].replace("/", " › "), [item(e=p, h=h) for h, p in paras]))
        def chapter_key(n):
            m = re.search(r"Session ([IVXL]+)\b", n)
            return (0 if re.search(r"Preface|Bull of Indiction|Title", n) else 1, 2 if "Second Part" in n else 1, roman(m.group(1)) if m else 0,
                    [int(x) for x in re.findall(r"\d+", n)], "Indiction of the next" in n, n)
        parts.sort(key=lambda e: chapter_key(e[0]))
        add_work(wid, title, "christian", coll, parts, author=author, sub=sub, licence=WS_LIC)

# ---------------------------------------------------------------- CCEL (Church Fathers etc.)
FATHERS = [("anf%02d" % i, "Ante-Nicene Fathers, volume %d" % i, "ed. Philip Schaff and others", "Church Fathers: Ante-Nicene (to AD 325)", "") for i in range(1, 11)] + \
       [("npnf1%02d" % i, "Nicene and Post-Nicene Fathers, series 1, volume %d" % i, "ed. Philip Schaff", "Church Fathers: Augustine and Chrysostom", "") for i in range(1, 15)] + \
       [("npnf2%02d" % i, "Nicene and Post-Nicene Fathers, series 2, volume %d" % i, "ed. Philip Schaff and Henry Wace", "Church Fathers: Greek and Latin Fathers, councils", "") for i in range(1, 15)] + \
       [("creeds1", "Creeds of Christendom, volume 1: history", "Philip Schaff", "Creeds of Christendom (Schaff)", ""),
        ("creeds2", "Creeds of Christendom, volume 2: Greek and Latin creeds", "Philip Schaff", "Creeds of Christendom (Schaff)", ""),
        ("creeds3", "Creeds of Christendom, volume 3: Protestant creeds", "Philip Schaff", "Creeds of Christendom (Schaff)", ""),
        ("summa", "Summa Theologica", "Thomas Aquinas (d. 1274)", "Catholic theology", ""),
        ("institutes", "Institutes of the Christian Religion", "John Calvin (d. 1564)", "Protestant theology", "Reformed")]
PT, CT, CS, CH = "Protestant theology", "Catholic theology", "Catholic spiritual writers", "Church history and other works"
CCEL2 = [
 ("luther__smallcat", "Luther's Small Catechism", "Martin Luther (d. 1546)", PT, "Lutheran"),
 ("luther__largecatechism", "Luther's Large Catechism", "Martin Luther (d. 1546)", PT, "Lutheran"),
 ("luther__first_prin", "First Principles of the Reformation: the Ninety-five Theses and three treatises", "Martin Luther (d. 1546)", PT, "Lutheran"),
 ("luther__bondage", "The Bondage of the Will", "Martin Luther (d. 1546)", PT, "Lutheran"),
 ("luther__good_works", "A Treatise on Good Works", "Martin Luther (d. 1546)", PT, "Lutheran"),
 ("luther__tabletalk", "Table Talk", "Martin Luther (d. 1546)", PT, "Lutheran"),
 ("calvin__calcom38", "Commentary on Romans", "John Calvin (d. 1564)", PT, "Reformed"),
 ("hodge__theology1", "Systematic Theology, volume 1", "Charles Hodge (d. 1878)", PT, "Reformed"),
 ("hodge__theology2", "Systematic Theology, volume 2", "Charles Hodge (d. 1878)", PT, "Reformed"),
 ("hodge__theology3", "Systematic Theology, volume 3", "Charles Hodge (d. 1878)", PT, "Reformed"),
 ("edwards__works1", "Works of Jonathan Edwards, volume 1", "Jonathan Edwards (d. 1758)", PT, "Reformed"),
 ("edwards__works2", "Works of Jonathan Edwards, volume 2", "Jonathan Edwards (d. 1758)", PT, "Reformed"),
 ("owen__mort", "Of the Mortification of Sin in Believers", "John Owen (d. 1683)", PT, "Puritan"),
 ("baxter__saints_rest", "The Saints' Everlasting Rest", "Richard Baxter (d. 1691)", PT, "Puritan"),
 ("bunyan__pilgrim", "The Pilgrim's Progress", "John Bunyan (d. 1688)", PT, "Puritan"),
 ("henry__mhcc", "Concise Commentary on the Bible", "Matthew Henry (d. 1714)", PT, "Puritan"),
 ("arminius__works1", "Works of James Arminius, volume 1", "James Arminius (d. 1609)", PT, "Arminian and Methodist"),
 ("arminius__works2", "Works of James Arminius, volume 2", "James Arminius (d. 1609)", PT, "Arminian and Methodist"),
 ("arminius__works3", "Works of James Arminius, volume 3", "James Arminius (d. 1609)", PT, "Arminian and Methodist"),
 ("wesley__sermons", "Sermons on Several Occasions", "John Wesley (d. 1791)", PT, "Arminian and Methodist"),
 ("wesley__notes", "Notes on the Bible", "John Wesley (d. 1791)", PT, "Arminian and Methodist"),
 ("wesley__journal", "Journal of John Wesley", "John Wesley (d. 1791)", PT, "Arminian and Methodist"),
 ("wesley__perfection", "A Plain Account of Christian Perfection", "John Wesley (d. 1791)", PT, "Arminian and Methodist"),
 ("finney__theology", "Systematic Theology", "Charles Finney (d. 1875)", PT, "Arminian and Methodist"),
 ("law__serious_call", "A Serious Call to a Devout and Holy Life", "William Law (d. 1761)", PT, "Anglican"),
 ("ryle__holiness", "Holiness", "J. C. Ryle (d. 1900)", PT, "Anglican"),
 ("spurgeon__sermons01", "Sermons, volume 1 (1855)", "Charles Spurgeon (d. 1892)", PT, "Baptist"),
 ("augustine__enchiridion", "Enchiridion: Handbook on Faith, Hope and Love", "Augustine of Hippo (d. 430)", CT, ""),
 ("anselm__basic_works", "Proslogium, Monologium and Cur Deus Homo", "Anselm of Canterbury (d. 1109)", CT, ""),
 ("pascal__pensees", "Pensees", "Blaise Pascal (d. 1662)", CT, ""),
 ("newman__apologia", "Apologia Pro Vita Sua", "John Henry Newman (d. 1890)", CT, ""),
 ("kempis__imitation", "The Imitation of Christ", "Thomas a Kempis (d. 1471)", CS, ""),
 ("bernard__loving_god", "On Loving God", "Bernard of Clairvaux (d. 1153)", CS, ""),
 ("julian__revelations", "Revelations of Divine Love", "Julian of Norwich (d. after 1416)", CS, ""),
 ("catherine__dialog", "The Dialogue", "Catherine of Siena (d. 1380)", CS, ""),
 ("ignatius__exercises", "The Spiritual Exercises", "Ignatius of Loyola (d. 1556)", CS, ""),
 ("teresa__castle2", "The Interior Castle", "Teresa of Avila (d. 1582)", CS, ""),
 ("desales__devout_life", "Introduction to the Devout Life", "Francis de Sales (d. 1622)", CS, ""),
 ("lawrence__practice", "The Practice of the Presence of God", "Brother Lawrence (d. 1691)", CS, ""),
 ("chesterton__orthodoxy", "Orthodoxy", "G. K. Chesterton (d. 1936)", CH, "Other writers"),
 ("josephus__complete", "Josephus: Complete Works", "Flavius Josephus (d. about 100)", CH, "Jewish history"),
] + [("schaff__hcc%d" % i, "History of the Christian Church, volume %d" % i, "Philip Schaff (d. 1893)", CH, "Church history") for i in range(1, 9)]
# Left out after reading each file's rights statement or checking the translation:
CCEL_EXCLUDED = {"herbermann": "Catholic Encyclopedia (1913): the online transcription carries a copyright claim by K. Knight",
                 "voragine": "The Golden Legend: the transcription carries a copyright claim and forbids commercial use",
                 "john_cross": "Dark Night of the Soul: E. Allison Peers translation (1935), status not established",
                 "luther__galatians": "Luther on Galatians: 1949 abridged translation, status not established"}
SKIP_TITLE = re.compile(r"^(title page|indexes?|index of .*|table of contents|subject index|.*scripture references.*|greek words.*|hebrew words.*|latin words.*|german words.*|french words.*|index of pages.*)$", re.I)
PART_LIMIT = 120000

def ccel_parts(sections):
    """sections: [(trail of headings, [paragraphs])] in reading order -> [(part title, items)].
    A work (two heading levels) that fits in one file stays whole; a larger one is divided along its third-level headings."""
    def short(t):
        return t if len(t) <= 70 else t[:67] + "..."
    def emit(group):
        return [item(e=p if isinstance(p, str) else p[0], o="" if isinstance(p, str) else p[1], h=" › ".join(trail[2:]) if i == 0 else "")
                for trail, paras in group for i, p in enumerate(paras)]
    size = lambda group: sum(len(p if isinstance(p, str) else p[0]) for _, paras in group for p in paras)
    parts, i = [], 0
    while i < len(sections):
        k2 = tuple(sections[i][0][:2]); j = i
        while j < len(sections) and tuple(sections[j][0][:2]) == k2:
            j += 1
        group, base = sections[i:j], " › ".join(k2)
        i = j
        if size(group) <= PART_LIMIT:
            subs = []
            for trail, _ in group:
                for h in trail[2:]:
                    if h and h[:90] not in subs:
                        subs.append(h[:90])
            parts.append((base, emit(group), " | ".join(subs)[:900]))
            continue
        subs, a = [], 0                                # runs sharing a third-level heading
        while a < len(group):
            k3 = tuple(group[a][0][:3]); b = a
            while b < len(group) and tuple(group[b][0][:3]) == k3:
                b += 1
            subs.append((k3[2] if len(k3) > 2 else "", group[a:b])); a = b
        cur, names, csize = [], [], 0
        def flush():
            if cur:
                n = [x for x in names if x]
                label = "" if not n else short(n[0]) if len(n) == 1 else "%s … %s" % (short(n[0]), short(n[-1]))
                parts.append((base + (" › " + label if label else ""), emit(cur), " | ".join(x[:90] for x in n) if len(n) > 1 else ""))
        for name, sg in subs:
            if cur and csize + size(sg) > PART_LIMIT:
                flush(); cur, names, csize = [], [], 0
            cur += sg; names.append(name); csize += size(sg)
        flush()
    return parts

def ccel():
    from lxml import etree
    for folder, table in (("ccel", FATHERS), ("ccel2", CCEL2)):
        for key, title, author, coll, sub in table:
            path = f"{src}/{folder}/{key}.xml"
            if not os.path.exists(path):
                continue
            root = etree.parse(path, etree.XMLParser(recover=True, huge_tree=True, resolve_entities=False)).getroot()
            rights = ws(" ".join(root.xpath(".//DC.Rights//text()")))
            if re.search(r"copyright", rights, re.I) and not re.search(r"public domain", rights, re.I):
                skipped.append((title, "CCEL rights statement: " + rights[:120]))
                continue
            body = root.find(".//ThML.body")
            for n in body.iter("note"):                 # footnotes: drop, but keep the text that follows them
                n.text = None
                for c in list(n):
                    n.remove(c)
            sections = []                               # (path of headings, [paragraph or (english, original)])
            plen = lambda paras: sum(len(p if isinstance(p, str) else p[0]) for p in paras)
            def rows(table):
                """A two-column table whose first column is marked as another language is a parallel text."""
                out = []
                for tr in table.iter("tr"):
                    cells = [c for c in tr if isinstance(c.tag, str) and c.tag in ("td", "th")]
                    texts = [ws("".join(c.itertext())) for c in cells]
                    if len(cells) == 2 and all(texts) and (cells[0].get("lang") or cells[0].find(".//*[@lang]") is not None):
                        out.append((texts[1], texts[0]))
                    elif any(texts):
                        out.append(" — ".join(t for t in texts if t))
                return out
            def walk(el, trail):
                name = el.tag if isinstance(el.tag, str) else ""
                if re.fullmatch(r"div\d", name):
                    t = ws(el.get("title") or "")
                    if SKIP_TITLE.match(t):
                        return
                    trail = trail + [t]
                    here, paras = trail, []
                    def close():
                        if plen(paras) > 40:
                            sections.append((here, list(paras)))
                        paras.clear()
                    for c in el:
                        cn = c.tag if isinstance(c.tag, str) else ""
                        if re.fullmatch(r"div\d", cn):
                            continue
                        if re.fullmatch(r"h\d", cn):
                            head = ws("".join(c.itertext()))
                            # A heading in the middle of a section starts a named sub-section (how Schaff sets out
                            # the Vatican decrees); one that only repeats the section title is dropped.
                            a, b = re.sub(r"\W+", "", head.lower()), re.sub(r"\W+", "", t.lower())
                            if head and len(head) < 200 and a and a not in b and b not in a:
                                close()
                                here = trail + [head]
                            continue
                        if cn == "table":
                            paras.extend(rows(c))
                            continue
                        txt = ws("".join(c.itertext()))
                        if txt:
                            paras.append(txt)
                    close()
                for c in el:
                    if isinstance(c.tag, str) and re.fullmatch(r"div\d", c.tag):
                        walk(c, trail)
            walk(body, [])
            wid = "ccel-" + key.replace("__", "-").replace("_", "-")
            add_work(wid, title, "christian", coll, ccel_parts(sections), author=author, sub=sub, lang="la" if key.startswith("creeds") else "",
                     licence="%s Text via the Christian Classics Ethereal Library (ccel.org); footnotes omitted." %
                             ("Public domain." if "public domain" in rights.lower() else "Written before 1930 and in the public domain by age; the file carries no rights statement."))
    for k, why in CCEL_EXCLUDED.items():
        skipped.append((k, why))

for step in (sunni, sunni2, shia, tafsir, creeds, sefaria, sefaria2, ccel, wikisource):
    before = len(works)
    step()
    print(step.__name__, len(works) - before, "works", sum(w["items"] for w in works[before:]), "items", flush=True)
with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
    json.dump(works, f, ensure_ascii=False, separators=(",", ":"))
with open(os.path.join(out, "skipped.json"), "w", encoding="utf-8") as f:
    json.dump(skipped, f, ensure_ascii=False, indent=0)
print(len(skipped), "texts left out on licence grounds (see skipped.json)")
