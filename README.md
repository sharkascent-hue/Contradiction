# Scripture Q&A

A static site: the Bible in four public-domain translations, full-text search, and
answer pages that quote the verses and set Christian, Muslim, Jewish and critical views side by side.

Open `index.html` through any web server (for example `python3 -m http.server` in this folder).
There is no build step and no backend.

## Layout

- `index.html`, `app.js`, `style.css`: the site (hash-routed).
- `content/questions.json`, `content/disputes.json`: question and dispute pages, and topics.
- `content/beliefs.json`: what each tradition believes, and the topic-by-topic comparison.
- `data/<EDITION>/<BOOK>.json`: scripture, one file per book (or surah): an array of chapters, each an array of verses.
- `lib/<work>/`: everything else. `toc.json` lists the parts, `<n>.json` holds one part, `nums.json` maps hadith numbers to their place.
- `lib/skipped.json`: texts left out because no open licence could be confirmed.
- `search/`: word index over the English text of every work (`meta.json` plus 1,024 bucket files).
- `api/chat.js`, `package.json`: optional serverless function that writes an AI answer from the passages the Ask page finds.
- `tools/`: `build_data.py`, `build_library.py`, `build_search.py` rebuild `data/`, `lib/` and `search/` from downloaded sources;
  `check_content.py` verifies every reference and link in `content/`.

## AI guide (optional)

Without a server the Ask page answers from the topic guide (`content/guide.json`). With the AI guide switched on,
Claude writes the answer, keeps the conversation, cites the passages by number, and looks up more as it writes,
using three tools that read this site's own published files: `get_passage` (Bible, Quran, hadith by number),
`search_texts` (the word index in `search/`) and `find_topic` (the guide).

- `server/core.js`: the conversation turn, tools and safety limits. Model `claude-opus-5-5`, streamed, with refusal fallbacks.
- `api/chat.js`: the same as a Vercel function (needs `ANTHROPIC_API_KEY` in the Vercel project).
- `worker/`: the same as a Cloudflare Worker (`npx wrangler deploy`, then `npx wrangler secret put ANTHROPIC_API_KEY`).
- `content/config.json`: set `aiEndpoint` to the worker's address, e.g. `https://contradiction-ai.<name>.workers.dev`.
  On a host that serves `api/chat` itself, leave it empty.

Every answer costs money (roughly 5 to 10 US cents with Opus). Set a monthly spending limit in the Anthropic Console.
The server limits each visitor to 6 questions a minute per instance; that is not a substitute for a spending limit.

## Writing content

Text in `content/` is plain text with automatic links:

- `Matthew 5:38–39`, `Quran 4:157`: the verses.
- `Sahih al-Bukhari 5134`, `Sahih Muslim 1422`, `Jami' at-Tirmidhi 3713`: the hadith with that number.
- `Kiddushin 21b`, `Mishnah Sanhedrin 10:1`: the Talmud page or Mishnah passage.
- `[[lib/creed-nicene-creed|Nicene Creed]]`, `[[q/faith-or-works|Faith or works?]]`, `[[go/ccel-creeds2/Longer Catechism|...]]`: any page.
  `go/<work>/<key>` finds a hadith number, a chapter, a Talmud page or a section whose title contains the key.
- `{"quote": "Luke 23:34"}` prints the verse itself.
- `**bold**`.

Each section of a question has a `view`: overview, christian, orthodox, catholic, protestant, muslim, sunni, shia, jewish, critics.
Run `python3 tools/check_content.py .` after editing.

## What is stored

| Area | Contents | Source |
|------|----------|--------|
| Bible | KJV with Apocrypha, World English Bible, Douay-Rheims, Brenton Septuagint, JPS 1917 Tanakh; Hebrew (Leningrad Codex), Greek NT (Byzantine, Textus Receptus), Latin Vulgate | scrollmapper/bible_databases, eBible.org |
| Quran | English: Pickthall, Yusuf Ali, Shakir, Rodwell, Palmer, Sale. Arabic: Hafs, Warsh, Qalun, al-Duri, Shu'ba, al-Bazzi, Qunbul, al-Susi | fawazahmed0/quran-api |
| Quran commentary | English: Jalalayn, Tanwir al-Miqbas, Asbab al-Nuzul, Ibn Kathir (abridged), Ma'arif al-Qur'an, al-Mukhtasar, Tazkirul Quran. Arabic: al-Tabari, Ibn Kathir, al-Qurtubi, al-Baghawi, al-Razi, al-Zamakhshari, al-Baydawi, al-Sa'di, Jalalayn, al-Muyassar | spa5k/tafsir_api |
| Sunni hadith | Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah, Muwatta Malik, Musnad Ahmad (partial), Darimi, Riyad as-Salihin, Bulugh al-Maram, al-Adab al-Mufrad, Mishkat, Shama'il, three forty-hadith collections; Arabic and English | fawazahmed0/hadith-api, AhmedBaset/hadith-json |
| Shia hadith | al-Kafi (8 vols), Man La Yahduruh al-Faqih (5), Tahdhib al-Ahkam (4), Nahj al-Balagha and 21 more; Arabic and English | thaqalayn-api.net |
| Jewish texts | Mishnah and Babylonian Talmud (English and Hebrew/Aramaic), minor tractates, Jerusalem Talmud, Tosefta, Midrash, Targum, Mishneh Torah, Shulchan Arukh, medieval Bible and Mishnah commentaries, Jewish thought, Musar, liturgy, Josephus, Philo, Apocrypha | Sefaria export |
| Catholic reference | The Catholic Encyclopedia (1913, 16 volumes), Canons and Decrees of the Council of Trent, the Roman Catechism; also Easton's Bible Dictionary and parts of the Book of Common Prayer | English Wikisource dump (dumps.wikimedia.org), fetched by byte range |
| Christian teaching | 35 creeds, confessions and catechisms; Schaff's Creeds of Christendom; Ante-Nicene and Nicene and Post-Nicene Fathers (37 vols); Aquinas, Anselm, Augustine; Luther, Calvin, Arminius, Wesley, Edwards, Hodge and others; Catholic spiritual writers; Schaff's History of the Christian Church | NonlinearFruit/Creeds.json, ccel.org |

## Licences: read before publishing

- Public domain: all Bible editions, the Arabic Quran, Pickthall, Rodwell, Palmer, Sale, the creeds, and everything from CCEL
  (each CCEL file's rights statement was read; files claiming copyright were left out).
- Not verified: the Yusuf Ali and Shakir Quran translations, every English hadith translation (Sunni and Shia),
  and the modern Quran commentaries. They come from open datasets, but the translators' rights were not checked.
- Jewish texts carry the licence Sefaria records for each version: CC0, public domain, CC-BY, CC-BY-SA or CC-BY-NC.
  The main English Talmud and Mishneh Torah are CC-BY-NC: no commercial use.
- Wikisource texts are public-domain works; Wikisource's own additions are CC BY-SA.
- Left out: see `lib/skipped.json`, plus modern Bible and Quran translations, the Catechism of the Catholic Church and Vatican II.

Each work's page shows its own licence line.

## Status

Answers and belief summaries are drafts and have not been reviewed by a priest, imam, rabbi or scholar.
