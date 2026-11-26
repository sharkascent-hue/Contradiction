// Latest religion-debate uploads from the YouTube channels listed in the site's content/channels.json.
// Same rules as tools/fetch_videos.py, which writes the fallback snapshot content/videos.json.
const TOPIC = /\b(jesus|christ|christian|christianity|church|catholic|orthodox|protestant|bible|gospel|trinity|god|allah|islam|muslim|quran|qur'an|koran|hadith|muhammad|prophet|sunni|shia|shi'a|jew|jews|jewish|judaism|rabbi|torah|talmud|messiah|paul|crucifi|resurrect|apologetic|debate|atheis|scripture|isaiah|moses|abraham|mary|imam)/i;
const unxml = s => (s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const tag = (xml, name) => { const m = xml.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">")); return m ? unxml(m[1]) : ""; };

export async function latestVideos(siteUrl) {
  const { channels } = await (await fetch(new URL("content/channels.json", siteUrl))).json();
  const since = Date.now() - 120 * 86400e3, videos = [];
  await Promise.all(channels.map(async ch => {
    try {
      const r = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + encodeURIComponent(ch.id), { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) return;
      for (const e of (await r.text()).split("<entry>").slice(1)) {
        const id = tag(e, "yt:videoId"), title = tag(e, "title"), when = Date.parse(tag(e, "published"));
        if (!id || /\/shorts\//.test(e) || !(when > since) || !TOPIC.test(title)) continue;
        const views = (e.match(/<media:statistics views="(\d+)"/) || [])[1];
        videos.push({ id, title, channel: ch.name, faith: ch.faith, branch: ch.branch || "", date: new Date(when).toISOString().slice(0, 10),
          desc: tag(e, "media:description").replace(/\s+/g, " ").slice(0, 500), views: +views || 0 });
      }
    } catch (e) { /* one channel failing must not stop the rest */ }
  }));
  videos.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.views - a.views));
  return { updated: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", videos: videos.slice(0, 150) };
}
