"""Build small share pages (q/<slug>/, d/<id>/, hard/<id>/) with titles, descriptions and preview images,
plus sitemap.xml. Each page sends the reader on to the full page in the app.
Run from the site folder after editing content/:  python3 tools/build_share.py .
Set INDEX = True once the site may be listed by search engines."""
import json, os, sys, html, shutil
INDEX = False
SITE = "https://contradictionai.com/"
root = sys.argv[1] if len(sys.argv) > 1 else "."
J = lambda *p: json.load(open(os.path.join(root, *p), encoding="utf-8"))
pages = []
for f in ("questions.json", "disputes.json", "questions2.json"):
    for q in J("content", f)["questions"]:
        body = " ".join(s["h"] for s in q["sections"])
        pages.append(("q/" + q["slug"], q["title"], q["short"], body))
for a in J("content", "debates.json")["arguments"]:
    pages.append(("d/" + a["id"], a["title"], a["argument"][:300], a.get("assessment", "")[:400]))
for t in J("content", "hard.json")["topics"]:
    pages.append(("hard/" + t["id"], t["title"], t["short"], " ".join(r for f in t["faiths"].values() for r, _ in f["texts"])))
for d in ("q", "d", "hard"):
    shutil.rmtree(os.path.join(root, d), ignore_errors=True)
e = lambda s: html.escape(s, quote=True)
for path, title, desc, body in pages:
    out = os.path.join(root, path); os.makedirs(out, exist_ok=True)
    url = SITE + path + "/"
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)} · Contradiction AI</title>
<meta name="description" content="{e(desc[:300])}">
<meta name="robots" content="{'index, follow' if INDEX else 'noindex'}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Contradiction AI">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc[:300])}">
<meta property="og:url" content="{url}"><meta property="og:image" content="{SITE}brand/share.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="../../brand/favicon.png">
<script>location.replace("../../#/{path}");</script>
</head><body style="font:16px/1.6 Georgia,serif;max-width:640px;margin:40px auto;padding:0 16px;background:#F6EFE2;color:#1A120B">
<h1>{e(title)}</h1><p>{e(desc)}</p><p>{e(body[:600])}</p>
<p><a href="../../#/{path}">Read it on Contradiction AI</a></p></body></html>
""")
urls = ["", "#/ask"] + [p[0] + "/" for p in pages]
open(os.path.join(root, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f"  <url><loc>{SITE}{u}</loc></url>\n" for u in urls if "#" not in u) + "</urlset>\n")
open(os.path.join(root, "robots.txt"), "w").write(("User-agent: *\nAllow: /\n" if INDEX else "User-agent: *\nDisallow: /\n") + f"Sitemap: {SITE}sitemap.xml\n")
print(len(pages), "share pages")
