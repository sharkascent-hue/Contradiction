#!/usr/bin/env python3
"""Build scripture/data/ from public-domain sources.

Usage: python3 build_data.py <src_dir> <out_dir>

<src_dir>/bible/ must contain:
  KJVA, DRC, JPS, WLC, TR, Byz, VulgClementine (.json)
                           from github.com/scrollmapper/bible_databases (formats/json/)
  eng-web_vpl/eng-web_vpl.txt, eng-Brenton_vpl/eng-Brenton_vpl.txt
                           from ebible.org/Scriptures/<id>_vpl.zip
<src_dir>/quran/ must contain the edition files named below
                           from github.com/fawazahmed0/quran-api (editions/<name>.json)
Output: <out_dir>/<TR>/<BOOK>.json  = [[verse texts of ch.1], [ch.2], ...]
        <out_dir>/index.json        = books + translations manifest
"""
import json, os, sys, collections

src, out = sys.argv[1], sys.argv[2]

# code, display name, group (ot / dc = deuterocanon & apocrypha / nt)
BOOKS = [
 ("GEN","Genesis","ot"),("EXO","Exodus","ot"),("LEV","Leviticus","ot"),("NUM","Numbers","ot"),
 ("DEU","Deuteronomy","ot"),("JOS","Joshua","ot"),("JDG","Judges","ot"),("RUT","Ruth","ot"),
 ("1SA","1 Samuel","ot"),("2SA","2 Samuel","ot"),("1KI","1 Kings","ot"),("2KI","2 Kings","ot"),
 ("1CH","1 Chronicles","ot"),("2CH","2 Chronicles","ot"),("EZR","Ezra","ot"),("NEH","Nehemiah","ot"),
 ("EST","Esther","ot"),("JOB","Job","ot"),("PSA","Psalms","ot"),("PRO","Proverbs","ot"),
 ("ECC","Ecclesiastes","ot"),("SOL","Song of Solomon","ot"),("ISA","Isaiah","ot"),("JER","Jeremiah","ot"),
 ("LAM","Lamentations","ot"),("EZE","Ezekiel","ot"),("DAN","Daniel","ot"),("HOS","Hosea","ot"),
 ("JOE","Joel","ot"),("AMO","Amos","ot"),("OBA","Obadiah","ot"),("JON","Jonah","ot"),("MIC","Micah","ot"),
 ("NAH","Nahum","ot"),("HAB","Habakkuk","ot"),("ZEP","Zephaniah","ot"),("HAG","Haggai","ot"),
 ("ZEC","Zechariah","ot"),("MAL","Malachi","ot"),
 ("TOB","Tobit","dc"),("JDT","Judith","dc"),("ESG","Esther (Greek)","dc"),("WIS","Wisdom of Solomon","dc"),
 ("SIR","Sirach","dc"),("BAR","Baruch","dc"),("EPJ","Letter of Jeremiah","dc"),("S3Y","Prayer of Azariah","dc"),
 ("SUS","Susanna","dc"),("BEL","Bel and the Dragon","dc"),("DNG","Daniel (Greek)","dc"),
 ("1MA","1 Maccabees","dc"),("2MA","2 Maccabees","dc"),("3MA","3 Maccabees","dc"),("4MA","4 Maccabees","dc"),
 ("1ES","1 Esdras","dc"),("4ES","2 Esdras","dc"),("PRM","Prayer of Manasseh","dc"),("PSX","Psalm 151","dc"),
 ("LAO","Laodiceans","dc"),
 ("MAT","Matthew","nt"),("MAR","Mark","nt"),("LUK","Luke","nt"),("JOH","John","nt"),("ACT","Acts","nt"),
 ("ROM","Romans","nt"),("1CO","1 Corinthians","nt"),("2CO","2 Corinthians","nt"),("GAL","Galatians","nt"),
 ("EPH","Ephesians","nt"),("PHI","Philippians","nt"),("COL","Colossians","nt"),("1TH","1 Thessalonians","nt"),
 ("2TH","2 Thessalonians","nt"),("1TI","1 Timothy","nt"),("2TI","2 Timothy","nt"),("TIT","Titus","nt"),
 ("PHM","Philemon","nt"),("HEB","Hebrews","nt"),("JAM","James","nt"),("1PE","1 Peter","nt"),
 ("2PE","2 Peter","nt"),("1JO","1 John","nt"),("2JO","2 John","nt"),("3JO","3 John","nt"),("JUD","Jude","nt"),
 ("REV","Revelation","nt"),
]
ORDER = [b[0] for b in BOOKS]
NAME2CODE = {n: c for c, n, _ in BOOKS}

def scroll_code(name):
    """Map a scrollmapper book name ('II Corinthians') to our code."""
    special = {"Revelation of John": "REV", "Wisdom": "WIS", "Additions to Esther": "ESG",
               "Prayer of Manasses": "PRM", "Additional Psalm": "PSX", "II Esdras": "4ES", "Revelation": "REV",
               "I Esdras": "1ES"}
    if name in special:
        return special[name]
    for roman, n in (("III ", "3 "), ("II ", "2 "), ("I ", "1 ")):
        if name.startswith(roman):
            name = n + name[len(roman):]
            break
    return NAME2CODE[name]

def from_scrollmapper(path):
    d = json.load(open(path, encoding="utf-8"))
    books = collections.OrderedDict()
    for b in d["books"]:
        chapters = []
        for ch in b["chapters"]:
            verses = []
            for v in ch["verses"]:
                while len(verses) < v["verse"] - 1:
                    verses.append("")
                verses.append(" ".join(v["text"].split()))
            while len(chapters) < ch["chapter"] - 1:
                chapters.append([])
            chapters.append(verses)
        if any(v for c in chapters for v in c):   # Greek NT files carry empty OT books
            books[scroll_code(b["name"])] = chapters
    return books

def from_vpl(path):
    books = collections.OrderedDict()
    for line in open(path, encoding="utf-8-sig"):
        line = line.rstrip("\n")
        if not line.strip():
            continue
        code, ref, text = line.split(" ", 2)
        c, v = ref.split(":")
        c, v = int(c), int(v.rstrip("abcdefghijklmnopqrstuvwxyz"))  # LXX extras like 9:2a join verse 2
        chapters = books.setdefault(code, [])
        while len(chapters) < c:
            chapters.append([])
        verses = chapters[c - 1]
        while len(verses) < v:
            verses.append("")
        verses[v - 1] = (verses[v - 1] + " " + " ".join(text.split())).strip()
    return books

SURAHS = """Al-Fatihah|Al-Baqarah|Ali 'Imran|An-Nisa|Al-Ma'idah|Al-An'am|Al-A'raf|Al-Anfal|At-Tawbah|Yunus|Hud|Yusuf|Ar-Ra'd|Ibrahim|Al-Hijr|An-Nahl|Al-Isra|Al-Kahf|Maryam|Ta-Ha|Al-Anbiya|Al-Hajj|Al-Mu'minun|An-Nur|Al-Furqan|Ash-Shu'ara|An-Naml|Al-Qasas|Al-'Ankabut|Ar-Rum|Luqman|As-Sajdah|Al-Ahzab|Saba|Fatir|Ya-Sin|As-Saffat|Sad|Az-Zumar|Ghafir|Fussilat|Ash-Shura|Az-Zukhruf|Ad-Dukhan|Al-Jathiyah|Al-Ahqaf|Muhammad|Al-Fath|Al-Hujurat|Qaf|Adh-Dhariyat|At-Tur|An-Najm|Al-Qamar|Ar-Rahman|Al-Waqi'ah|Al-Hadid|Al-Mujadilah|Al-Hashr|Al-Mumtahanah|As-Saff|Al-Jumu'ah|Al-Munafiqun|At-Taghabun|At-Talaq|At-Tahrim|Al-Mulk|Al-Qalam|Al-Haqqah|Al-Ma'arij|Nuh|Al-Jinn|Al-Muzzammil|Al-Muddaththir|Al-Qiyamah|Al-Insan|Al-Mursalat|An-Naba|An-Nazi'at|'Abasa|At-Takwir|Al-Infitar|Al-Mutaffifin|Al-Inshiqaq|Al-Buruj|At-Tariq|Al-A'la|Al-Ghashiyah|Al-Fajr|Al-Balad|Ash-Shams|Al-Layl|Ad-Duha|Ash-Sharh|At-Tin|Al-'Alaq|Al-Qadr|Al-Bayyinah|Az-Zalzalah|Al-'Adiyat|Al-Qari'ah|At-Takathur|Al-'Asr|Al-Humazah|Al-Fil|Quraysh|Al-Ma'un|Al-Kawthar|Al-Kafirun|An-Nasr|Al-Masad|Al-Ikhlas|Al-Falaq|An-Nas""".split("|")
assert len(SURAHS) == 114
QBOOKS = [("Q%d" % (i + 1), "%d. %s" % (i + 1, n), "quran") for i, n in enumerate(SURAHS)]
ORDER += [b[0] for b in QBOOKS]

def from_quran(path):
    """Each surah is a book with one chapter."""
    books = collections.OrderedDict()
    for a in json.load(open(path, encoding="utf-8"))["quran"]:
        verses = books.setdefault("Q%d" % a["chapter"], [[]])[0]
        while len(verses) < a["verse"] - 1:
            verses.append("")
        verses.append(" ".join(a["text"].split()))
    return books

SM = "Text via scrollmapper/bible_databases."
QA = "Text via fawazahmed0/quran-api."
# id, name, sub, tradition, licence, loader, file, corpus, language
TRANSLATIONS = [
 ("KJV", "King James Version", "1769 text, with Apocrypha", "Protestant classic", "Public domain. " + SM, from_scrollmapper, "bible/KJVA.json", "bible", "en"),
 ("WEB", "World English Bible", "modern English", "Modern, ecumenical",
  "Public domain (\u201cWorld English Bible\u201d is a trademark of eBible.org). Text via eBible.org.", from_vpl, "bible/eng-web_vpl/eng-web_vpl.txt", "bible", "en"),
 ("DRC", "Douay-Rheims", "Challoner revision, 1749\u201352", "Catholic",
  "Public domain. " + SM + " Psalms use Vulgate numbering.", from_scrollmapper, "bible/DRC.json", "bible", "en"),
 ("LXX", "Brenton Septuagint", "Greek Old Testament in English, 1851", "Old Testament used by the Orthodox Church",
  "Public domain. Text via eBible.org. Old Testament only; Psalms use Septuagint numbering.", from_vpl, "bible/eng-Brenton_vpl/eng-Brenton_vpl.txt", "bible", "en"),
 ("JPS", "JPS Tanakh 1917", "Jewish Publication Society", "Jewish", "Public domain. " + SM + " Hebrew Bible only, in Jewish book order.", from_scrollmapper, "bible/JPS.json", "bible", "en"),
 ("WLC", "Hebrew Bible (Leningrad Codex)", "Westminster Leningrad Codex, Hebrew", "Original Hebrew", "Public domain. " + SM, from_scrollmapper, "bible/WLC.json", "bible", "he"),
 ("BYZ", "Greek New Testament (Byzantine)", "Byzantine Textform 2013, Greek", "Original Greek; the text type of the Orthodox Church", "Public domain. " + SM, from_scrollmapper, "bible/Byz.json", "bible", "el"),
 ("TR", "Greek New Testament (Textus Receptus)", "1550/1894, Greek", "Original Greek; the base of the King James Version", "Public domain. " + SM, from_scrollmapper, "bible/TR.json", "bible", "el"),
 ("VUL", "Latin Vulgate (Clementine)", "1592, Latin", "The Bible of the Latin Catholic Church", "Public domain. " + SM, from_scrollmapper, "bible/VulgClementine.json", "bible", "la"),
 ("PICK", "Quran: Pickthall", "The Meaning of the Glorious Koran, 1930", "English, by a Sunni Muslim translator", "Public domain in the United States. " + QA, from_quran, "quran/eng-mohammedmarmadu.json", "quran", "en"),
 ("YALI", "Quran: Yusuf Ali", "The Holy Qur\u2019an, 1934", "English, widely used by Sunni Muslims", "Translator died 1953; public domain in life+70 countries, status in the United States not verified. " + QA, from_quran, "quran/eng-abdullahyusufal.json", "quran", "en"),
 ("SHAK", "Quran: Shakir", "M. H. Shakir", "English, widely used by Shia Muslims", "Freely distributed; copyright status disputed and not verified. " + QA, from_quran, "quran/eng-mohammadhabibsh.json", "quran", "en"),
 ("RODW", "Quran: Rodwell", "J. M. Rodwell, 1861", "English, by a Christian clergyman", "Public domain. " + QA, from_quran, "quran/eng-johnmedowsrodwe.json", "quran", "en"),
 ("PALM", "Quran: Palmer", "E. H. Palmer, 1880", "English, by a British orientalist", "Public domain. " + QA, from_quran, "quran/eng-edwardhenrypalm.json", "quran", "en"),
 ("SALE", "Quran: Sale", "George Sale, 1734", "The first English translation from Arabic", "Public domain. " + QA, from_quran, "quran/eng-georgesale.json", "quran", "en"),
 ("HAFS", "Quran: Arabic (Hafs)", "Uthmani script, reading of Hafs from Asim", "The reading used by most Muslims, Sunni and Shia", "The Arabic text is not under copyright. " + QA, from_quran, "quran/ara-quranuthmanihaf.json", "quran", "ar"),
 ("WARSH", "Quran: Arabic (Warsh)", "reading of Warsh from Nafi", "Used in North and West Africa", "The Arabic text is not under copyright. " + QA, from_quran, "quran/ara-quranwarsh.json", "quran", "ar"),
 ("QALUN", "Quran: Arabic (Qalun)", "reading of Qalun from Nafi", "Used in Libya and Tunisia", "The Arabic text is not under copyright. " + QA, from_quran, "quran/ara-quranqaloon.json", "quran", "ar"),
 ("DURI", "Quran: Arabic (al-Duri)", "reading of al-Duri from Abu Amr", "Used in Sudan and East Africa", "The Arabic text is not under copyright. " + QA, from_quran, "quran/ara-qurandoori.json", "quran", "ar"),
 ("SHUBA", "Quran: Arabic (Shu\u2019ba)", "reading of Shu\u2019ba from Asim", "One of the canonical readings", "The Arabic text is not under copyright. " + QA, from_quran, "quran/ara-quranshouba.json", "quran", "ar"),
 ("BAZZI", "Quran: Arabic (al-Bazzi)", "reading of al-Bazzi from Ibn Kathir", "One of the canonical readings", "The Arabic text is not under copyright. " + QA, from_quran, "quran/ara-quranbazzi.json", "quran", "ar"),
 ("QUNBUL", "Quran: Arabic (Qunbul)", "reading of Qunbul from Ibn Kathir", "One of the canonical readings", "The Arabic text is not under copyright. " + QA, from_quran, "quran/ara-quranqumbul.json", "quran", "ar"),
 ("SUSI", "Quran: Arabic (al-Susi)", "reading of al-Susi from Abu Amr", "One of the canonical readings", "The Arabic text is not under copyright. " + QA, from_quran, "quran/ara-quransoosi.json", "quran", "ar"),
]

manifest = {"books": [{"code": c, "name": n, "group": g} for c, n, g in BOOKS + QBOOKS], "translations": []}
for tr, name, sub, tradition, licence, loader, fname, corpus, lang in TRANSLATIONS:
    books = loader(os.path.join(src, fname))
    unknown = [c for c in books if c not in ORDER]
    assert not unknown, (tr, unknown)
    os.makedirs(os.path.join(out, tr), exist_ok=True)
    listing, nverses = [], 0
    for code, chapters in books.items():      # keep each edition's own book order
        nverses += sum(len(c) for c in chapters)
        with open(os.path.join(out, tr, code + ".json"), "w", encoding="utf-8") as f:
            json.dump(chapters, f, ensure_ascii=False, separators=(",", ":"))
        listing.append([code, len(chapters)])
    manifest["translations"].append({"id": tr, "name": name, "sub": sub, "tradition": tradition, "licence": licence,
                                     "corpus": corpus, "lang": lang, "books": listing})
    print(tr, len(listing), "books", nverses, "verses")
with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
