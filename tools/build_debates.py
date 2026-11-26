#!/usr/bin/env python3
"""Turn the research file into content/debates.json.

Usage: python3 build_debates.py <research.json> [<more research.json> ...] > content/debates.json
Scripture, hadith, Mishnah and Talmud references go in "texts" (the site shows their actual words);
other works (histories, commentaries, manuscripts) go in "other_texts" with whether the researcher read them.
Verdicts are set here, in VERDICTS, after reading each assessment.
"""
import json, re, sys

VERDICTS = {
    "islamic-dilemma": "strong", "jesus-word-and-spirit": "weak", "jesus-creates-and-gives-life": "weak", "jesus-sinless-in-islam": "partial",
    "jesus-returns-as-judge": "weak", "crucifixion-denial-vs-history": "strong", "deceptive-god-objection": "partial",
    "quran-5-116-trinity-of-mary": "partial", "mary-sister-of-aaron": "partial", "apocryphal-parallels": "strong",
    "dhul-qarnayn-muddy-spring": "partial", "satanic-verses": "partial", "quran-textual-history": "partial", "muhammad-character": "partial",
    "jesus-never-says-i-am-god": "weak", "mark-10-18-why-call-me-good": "partial", "subordination-texts": "partial",
    "john-10-30-psalm-82": "partial", "comma-johanneum": "partial", "trinity-coherence": "partial", "genealogies-of-jesus": "partial",
    "judas-death": "strong", "crucifixion-day-and-hour": "partial", "resurrection-morning-and-jairus": "partial", "ending-of-mark": "partial",
    "sign-of-jonah": "weak", "paul-vs-jesus-and-james": "partial", "deuteronomy-18-18-muhammad": "weak", "paraclete-as-muhammad": "fails",
    "atonement-ezekiel-18": "partial", "old-testament-ethics": "partial", "isaiah-7-14-almah": "strong", "isaiah-53-servant": "partial",
    "messiah-criteria": "strong", "deuteronomy-18-not-muhammad": "strong", "uzayr-son-of-god": "strong",
}
# For "partly works" verdicts: which side the texts lean to ("arguer" or "replier"); absent means evenly balanced.
LEAN = {
    "jesus-sinless-in-islam": "replier", "quran-5-116-trinity-of-mary": "arguer", "mary-sister-of-aaron": "arguer", "satanic-verses": "replier",
    "mark-10-18-why-call-me-good": "arguer", "subordination-texts": "replier", "genealogies-of-jesus": "arguer", "crucifixion-day-and-hour": "arguer",
    "resurrection-morning-and-jairus": "arguer", "ending-of-mark": "arguer", "paul-vs-jesus-and-james": "replier", "old-testament-ethics": "arguer",
}
SIDE = {"christian": "Christian", "christianity": "Christian", "islam": "Muslim", "jewish": "Jewish", "judaism": "Jewish"}
def favours(a, verdict):
    x, y = (SIDE[w] for w in a["direction"].split("-vs-"))
    side = {"strong": "arguer", "weak": "replier", "fails": "replier"}.get(verdict) or LEAN.get(a["id"])
    if side == "arguer":
        return {"side": x, "text": "On this question the %s side makes more sense on the texts. The %s replies have not overturned it so far." % (x, y)}
    if side == "replier":
        return {"side": y, "text": "On this question the %s side makes more sense on the texts. The %s argument has not shown what it claims." % (y, x)}
    return {"side": "", "text": "Evenly balanced: each side has real texts on its side, and neither has disproved the other."}
SITE_REF = re.compile(r"^(Quran \d+(:\d+(-\d+)?)?|(Sahih al-Bukhari|Sahih Muslim|Sunan Abi Dawud|Jami' at-Tirmidhi|Sunan an-Nasa'i|Sunan Ibn Majah|Muwatta Malik) \d+|Mishnah [A-Z][a-z]+( [A-Z][a-z]+)? \d+:\d+|[1-3]? ?[A-Z][a-z]+( of [A-Z][a-z]+| [A-Z][a-z]+)? \d+(:\d+([-–]\d+)?)?(, ?\d+(:\d+)?([-–]\d+)?)*|[A-Z][a-z]+( [A-Z][a-z]+)? \d{1,3}[ab])$")

out = []
for path in sys.argv[1:]:
    for a in json.load(open(path, encoding="utf-8"))["arguments"]:
        texts, other = [], []
        for t in a["primary_texts"]:
            t = dict(t, ref=re.sub(r"^Babylonian Talmud ", "", re.sub(r" \((KJV|Hafs vs Warsh[^)]*)\)$", "", t["ref"])))
            if SITE_REF.match(t["ref"]):
                texts.append({"ref": t["ref"], "note": t.get("note", "")})
            else:
                other.append({"ref": t["ref"], "note": t.get("note", ""), "checked": bool(t.get("confirmed"))})
        out.append({
            "id": a["id"], "title": a["title"], "direction": a["direction"], "verdict": VERDICTS.get(a["id"], ""), "favours": favours(a, VERDICTS.get(a["id"], "")),
            "by": [p["name"] for p in a.get("proponents", [])], "argument": a["argument"],
            "texts": texts, "other_texts": other,
            "response_by": a["response"].get("by", []), "response": a["response"]["text"],
            "facts": a["texts_establish"], "assessment": a["assessment"],
            "sources": list(dict.fromkeys([u for p in a.get("proponents", []) for u in p.get("sources", [])] + a["response"].get("sources", []))),
        })
missing = [a["id"] for a in out if not a["verdict"]]
if missing:
    sys.exit("no verdict set for: " + ", ".join(missing))
def tidy(x):
    """'Isaiah 52:13-53:12' spans chapters, which the site's verse links can't take: write it '52:13 to 53:12'."""
    if isinstance(x, str):
        return re.sub(r"(\d+:\d+)[-–](\d+:\d+)", r"\1 to \2", x)
    if isinstance(x, list):
        return [tidy(i) for i in x]
    if isinstance(x, dict):
        return {k: tidy(v) for k, v in x.items()}
    return x
out = tidy(out)
json.dump({"arguments": out}, sys.stdout, ensure_ascii=False, indent=1)
