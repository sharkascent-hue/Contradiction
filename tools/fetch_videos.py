#!/usr/bin/env python3
"""Refresh content/videos.json from the YouTube feeds of the channels in content/channels.json.

Usage: python3 fetch_videos.py <site_dir>
Keeps videos from the last 120 days whose title or description is about religion, newest first, at most 150.
YouTube's public channel feeds need no key: https://www.youtube.com/feeds/videos.xml?channel_id=<id>
"""
import json, os, re, sys, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

site = sys.argv[1]
chans = json.load(open(os.path.join(site, "content", "channels.json"), encoding="utf-8"))["channels"]
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "m": "http://search.yahoo.com/mrss/"}
TOPIC = re.compile(r"\b(jesus|christ|christian|christianity|church|catholic|orthodox|protestant|bible|gospel|trinity|god|allah|islam|muslim|quran|qur'an|koran|hadith|muhammad|prophet|"
                   r"sunni|shia|shi'a|jew|jews|jewish|judaism|rabbi|torah|talmud|messiah|paul|crucifi|resurrect|apologetic|debate|atheis|scripture|isaiah|moses|abraham|mary|imam)", re.I)
since = datetime.now(timezone.utc) - timedelta(days=120)
videos = []
for ch in chans:
    url = "https://www.youtube.com/feeds/videos.xml?channel_id=" + ch["id"]
    try:
        root = ET.fromstring(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read())
    except Exception as e:
        print("skip", ch["name"], e, file=sys.stderr)
        continue
    for e in root.findall("a:entry", NS):
        vid = e.findtext("yt:videoId", "", NS)
        title = e.findtext("a:title", "", NS)
        desc = e.findtext("m:group/m:description", "", NS) or ""
        when = e.findtext("a:published", "", NS)
        link = (e.find("a:link", NS).get("href") if e.find("a:link", NS) is not None else "")
        if "/shorts/" in link or not vid:
            continue
        try:
            dt = datetime.fromisoformat(when.replace("Z", "+00:00"))
        except ValueError:
            continue
        if dt < since or not TOPIC.search(title):
            continue
        views = e.find("m:group/m:community/m:statistics", NS)
        videos.append({"id": vid, "title": title, "channel": ch["name"], "faith": ch["faith"], "branch": ch.get("branch", ""),
                       "date": dt.strftime("%Y-%m-%d"), "desc": re.sub(r"\s+", " ", desc)[:500],
                       "views": int(views.get("views")) if views is not None and views.get("views", "").isdigit() else 0})
videos.sort(key=lambda v: v["date"], reverse=True)
out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "videos": videos[:150]}
json.dump(out, open(os.path.join(site, "content", "videos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(videos), "videos from", len(chans), "channels")
