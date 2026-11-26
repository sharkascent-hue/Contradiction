/* Contradiction: static, hash-routed.
   Scripture in data/<EDITION>/<BOOK>.json, other texts in lib/<work>/, word index in search/,
   answers in content/questions.json and disputes.json, belief summaries in content/beliefs.json,
   the topic guide behind Ask in content/guide.json. */
(() => {
  const app = document.getElementById('app');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const GROUPS = { ot: 'Old Testament', dc: 'Deuterocanon & Apocrypha', nt: 'New Testament', quran: 'Quran' };
  const corpusOf = code => bookGroup[code] === 'quran' ? 'quran' : 'bible';
  const RTL = { he: 1, ar: 1 };
  const pref = { bible: 'WEB', quran: 'PICK' };
  const VIEW_GROUP = { orthodox: 'christian', catholic: 'christian', protestant: 'christian', sunni: 'muslim', shia: 'muslim' };
  let M, C, B, G, SITE_CFG = {}, tr, refRe, refOne, viewFilter = 'all', lastQ, renderId = 0;
  const bookName = {}, bookGroup = {}, alias = {}, trById = {}, cache = new Map();

  const getJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  const loadBook = (t, code) => {
    const k = t + '/' + code;
    if (!cache.has(k)) cache.set(k, getJSON('data/' + k + '.json'));
    return cache.get(k);
  };
  const has = (t, code) => trById[t].chapters[code] !== undefined;
  // The chosen translation if it has the book, otherwise the first one that does.
  const trFor = code => has(tr, code) ? tr : has(pref[corpusOf(code)], code) ? pref[corpusOf(code)]
    : (M.translations.find(t => has(t.id, code)) || {}).id;

  /* ---------- references ---------- */
  function setupRefs() {
    M.books.forEach(b => { bookName[b.code] = b.name; bookGroup[b.code] = b.group; alias[b.name.toLowerCase()] = b.code; });
    M.books.forEach(b => { if (b.group === 'quran') delete alias[b.name.toLowerCase()]; });
    Object.assign(alias, { quran: 'Q', "qur'an": 'Q', koran: 'Q', psalm: 'PSA', 'song of songs': 'SOL', wisdom: 'WIS', ecclesiasticus: 'SIR',
      'prayer of manasses': 'PRM', 'esther (greek)': 'ESG' });
    const names = Object.keys(alias).sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[()]/g, '\\$&').replace(/ /g, '\\s'));
    const src = '\\b(' + names.join('|') + ')\\s(\\d+)(?::(\\d+)(?:[–-](\\d+))?)?';
    refRe = new RegExp(src, 'gi');
    refOne = new RegExp(src, 'i');
  }
  function parseRef(s) {
    const m = refOne.exec(s);
    if (!m) return null;
    const code = alias[m[1].toLowerCase().replace(/\s+/g, ' ')];
    if (code === 'Q') {   // "Quran 4:157": surah 4 is its own book with one chapter
      if (+m[2] < 1 || +m[2] > 114) return null;
      return { code: 'Q' + m[2], ch: 1, v1: m[3] ? +m[3] : 0, v2: m[4] ? +m[4] : (m[3] ? +m[3] : 0), label: m[0] };
    }
    return { code, ch: +m[2], v1: m[3] ? +m[3] : 0, v2: m[4] ? +m[4] : (m[3] ? +m[3] : 0), label: m[0] };
  }
  const refHref = r => {
    const t = trFor(r.code);
    return '#/read/' + t + '/' + r.code + '/' + r.ch + (r.v1 ? '/' + r.v1 + (r.v2 > r.v1 ? '-' + r.v2 : '') : '');
  };
  const HADITH = { 'Sahih al-Bukhari': 'hadith-bukhari', 'Sahih Muslim': 'hadith-muslim', 'Sunan Abi Dawud': 'hadith-abudawud',
    "Jami' at-Tirmidhi": 'hadith-tirmidhi', "Sunan an-Nasa'i": 'hadith-nasai', 'Sunan Ibn Majah': 'hadith-ibnmajah', 'Muwatta Malik': 'hadith-malik' };
  const hadithRe = new RegExp('(' + Object.keys(HADITH).join('|') + ') (\\d+)', 'g');
  const talmudRe = new RegExp('\\b(Berakhot|Shabbat|Eruvin|Pesachim|Yoma|Sukkah|Beitzah|Rosh Hashanah|Taanit|Megillah|Moed Katan|Chagigah|Yevamot|Ketubot|Nedarim|Nazir|Sotah|Gittin|Kiddushin|Bava Kamma|Bava Metzia|Bava Batra|Sanhedrin|Makkot|Shevuot|Avodah Zarah|Horayot|Zevachim|Menachot|Chullin|Bekhorot|Arakhin|Temurah|Keritot|Meilah|Tamid|Niddah) (\\d{1,3}[ab])\\b', 'g');
  const mishnahRe = /\bMishnah ([A-Z][a-z]+(?: [A-Z][a-z]+)?) (\d+:\d+)/g;
  const slugify = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  /* Escape the text, then add links:
     [[route|label]]            any page of the site, e.g. [[lib/creed-nicene-creed|Nicene Creed]]
     Sahih al-Bukhari 5134      the hadith with that number
     Kiddushin 21b              the Talmud page;  Mishnah Sanhedrin 10:1  the Mishnah passage
     Matthew 5:38–39, Quran 4:157   the verses
     Finished links are set aside while later patterns run, so nothing is linked twice. */
  const mishnahWork = t => slugify(t) === 'avot' ? 'sef-pirkei-avot' : 'sef-mishnah-' + slugify(t);  // Avot is filed as Pirkei Avot
  function rich(s) {
    const held = [];
    const hold = h => '\u0001' + (held.push(h) - 1) + '\u0002';
    return esc(s)
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (m, path, label) => hold('<a href="#/' + encodeURI(path) + '">' + label + '</a>'))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(hadithRe, (m, book, n) => hold('<a class="ref" href="#/go/' + HADITH[book] + '/' + n + '">' + m + '</a>'))
      .replace(mishnahRe, (m, t, ref) => hold('<a class="ref" href="#/go/' + mishnahWork(t) + '/' + ref + '">' + m + '</a>'))
      .replace(talmudRe, (m, t, daf) => hold('<a class="ref" href="#/go/sef-' + slugify(t) + '/' + daf + '">' + m + '</a>'))
      .replace(refRe, m => {
        const r = parseRef(m);
        return r && trFor(r.code) ? '<a class="ref" href="' + refHref(r) + '">' + m + '</a>' : m;
      })
      .replace(/\u0001(\d+)\u0002/g, (m, i) => held[i]);
  }

  /* ---------- views ---------- */
  /* ---------- shared pieces ---------- */
  const isDispute = q => q.kind === 'dispute';
  const SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  const HUBS = {
    christianity: { key: 'christian', name: 'Christianity', glyph: '✝', branches: [['christianity', 'All'], ['orthodox', 'Orthodox'], ['catholic', 'Catholic'], ['protestant', 'Protestant']],
      blurb: 'About 2.4 billion people. One God as Father, Son and Holy Spirit, and Jesus as God made man, who died and rose again.', sub: 'Orthodox · Catholic · Protestant' },
    islam: { key: 'muslim', name: 'Islam', glyph: '☪', branches: [['islam', 'All'], ['sunni', 'Sunni'], ['shia', 'Shia']],
      blurb: 'About 1.9 billion people. One God, Allah, whose final revelation is the Quran, given to Muhammad, the last prophet.', sub: 'Sunni · Shia' },
    judaism: { key: 'jewish', name: 'Judaism', glyph: '✡', branches: [['judaism', 'Judaism']],
      blurb: 'About 15 million people. The one God of Abraham, his covenant with Israel, and the Torah given at Sinai.', sub: 'Orthodox · Conservative · Reform' } };
  const hubOf = slug => Object.keys(HUBS).find(h => HUBS[h].branches.some(b => b[0] === slug));
  const FAITH_ADJ = { christian: 'Christian', muslim: 'Muslim', jewish: 'Jewish' };
  const FAITH_PEOPLE = { christian: 'Christians', muslim: 'Muslims', jewish: 'Jews' };
  const GLYPH = { christian: '✝', muslim: '☪', jewish: '✡', all: '' };
  const art = w => w === 'Jewish' ? 'Jewish' : 'a ' + w;
  const POPULAR = ['trinity', 'jesus-divinity', 'crucifixion', 'salvation', 'afterlife', 'muhammad-in-bible', 'bible-changed', 'sunni-shia', 'food-laws', 'prayer', 'messiah', 'original-sin'];
  const SUGGEST = ['Explain the Trinity to me, I\'m a Muslim', 'Where is the Trinity in the Old and New Testament?', 'Was Jesus crucified?', 'Is Muhammad in the Bible?',
    'Why don\'t Jews believe in Jesus?', 'What happens after we die?', 'Is pork forbidden?', 'What\'s the difference between Sunni and Shia?'];
  const askBox = ph => '<form class="askbox"><textarea name="q" rows="1" placeholder="' + esc(ph) + '" aria-label="Your question" enterkeyhint="send"></textarea>' +
    '<button class="send" aria-label="Ask">' + SEND_SVG + '</button></form>';
  function bindAsk(onSubmit) {
    const f = app.querySelector('form.askbox');
    if (!f) return;
    const ta = f.q, grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
    ta.addEventListener('input', grow);
    const go = () => {
      const q = ta.value.trim();
      if (!q) return ta.focus();
      if (onSubmit) { ta.value = ''; grow(); setTimeout(() => { ta.value = ''; grow(); }, 0); onSubmit(q); } else location.hash = '#/ask/' + encodeURIComponent(q);
    };
    // Enter sends (Shift+Enter makes a new line). Not while an input method is still composing a character.
    ta.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); }
    });
    f.addEventListener('submit', e => { e.preventDefault(); go(); });
  }
  const faithCards = () => '<div class="faith-cards">' + Object.keys(HUBS).map(k => { const h = HUBS[k];
    return '<a class="faith-card ' + h.key + '" href="#/faith/' + k + '"><span class="glyph">' + h.glyph + '</span><strong>' + h.name + '</strong><span>' + h.sub + '</span><span class="arrow">→</span></a>'; }).join('') + '</div>';
  const disputeTile = q => {
    const fs = [...new Set(q.sections.map(s => VIEW_GROUP[s.view] || s.view).filter(v => FAITH_ADJ[v]))];
    return '<a class="dispute-tile" href="#/q/' + q.slug + '"><strong>' + esc(q.title) + '</strong><span>' + esc(q.short) + '</span><span class="vs">' +
      fs.map(f => '<i class="dot ' + f + '" title="' + FAITH_ADJ[f] + ' view"></i>').join('') + '</span></a>';
  };
  const readGrid = () => '<div class="read-grid">' + [
    ['#/books/KJV/protestant', 'The Bible', 'Protestant, Catholic and Orthodox'], ['#/books/PICK/sunni', 'The Quran', 'Sunni and Shia, with hadith'], ['#/books/JPS/jewish', 'The Torah', 'Hebrew Bible, Mishnah, Talmud'],
    ['#/lib/c/' + encodeURIComponent('Sunni hadith'), 'Hadith', 'Sunni and Shia collections'], ['#/lib/c/' + encodeURIComponent('Babylonian Talmud'), 'Talmud', 'Mishnah and Gemara'],
    ['#/lib/c/' + encodeURIComponent('Quran commentary (tafsir)'), 'Quran commentary', 'Classic tafsir'], ['#/lib/c/' + encodeURIComponent('Church Fathers: Ante-Nicene (to AD 325)'), 'Church Fathers', 'The early Church'],
    ['#/lib/c/' + encodeURIComponent('Creeds, confessions and catechisms'), 'Creeds', 'What the churches confess'], ['#/search', 'Search everything', 'Every word, every text']
  ].map(x => '<a href="' + x[0] + '"><strong>' + x[1] + '</strong><span>' + x[2] + '</span></a>').join('') + '</div>';

  function home() {
    document.title = 'Contradiction · Christianity, Islam and Judaism, side by side';
    const disputes = C.questions.filter(isDispute);
    app.innerHTML =
      '<section class="hero"><p class="eyebrow">Christianity · Islam · Judaism</p><h1>Ask anything. See what <em>each faith</em> really says.</h1>' +
      '<p class="lede">Beliefs, disagreements and the actual passages from the Bible, Quran, hadith and Talmud, side by side.</p>' +
      askBox('Ask anything…') +
      '<div class="suggest">' + SUGGEST.map(s => '<a class="chip" href="#/ask/' + encodeURIComponent(s) + '">' + esc(s) + '</a>').join('') + '</div></section>' +
      '<div class="section-head"><h2>Explore</h2></div>' + exploreGrid() +
      '<div class="section-head"><h2>The three faiths</h2><a href="#/faiths">Compare them →</a></div>' + faithCards() +
      '<div class="section-head"><h2>Where they disagree</h2><a href="#/questions">See all</a></div>' +
      '<div class="tile-row">' + disputes.map(disputeTile).join('') + '</div>' +
      '<div class="section-head"><h2>Debates</h2><a href="#/debates">All debates</a></div><div class="tile-row" id="home-deb"></div>' +
      '<div class="section-head"><h2>Explore by topic</h2><a href="#/topics">All ' + G.topics.length + ' topics</a></div>' +
      '<div class="topic-grid">' + POPULAR.map(id => G.topics.find(t => t.id === id)).filter(Boolean).map(t => '<a href="#/t/' + t.id + '">' + esc(t.title) + '</a>').join('') + '</div>' +
      '<div class="section-head"><h2>Read the texts</h2></div>' + readGrid();
    bindAsk();
    loadDebates().then(d => { const el = document.getElementById('home-deb'); if (el) el.innerHTML = d.arguments.length ? mixDirs(d.arguments).slice(0, 8).map(debTile).join('') : '<p class="muted small">Coming soon.</p>'; });
  }
  const questionCards = qs => '<ul class="cards">' + qs.map(q =>
    '<li><a href="#/q/' + q.slug + '"><strong>' + esc(q.title) + '</strong><span>' + esc(q.short) + '</span></a></li>').join('') + '</ul>';
  const searchForm = q => '<form class="searchbox" role="search"><input type="search" name="q" value="' + esc(q) +
    '" placeholder="Search every text, e.g. forgiveness, or John 3:16" aria-label="Search"><button>Search</button></form>';
  function bindSearch() {
    const f = app.querySelector('form.searchbox');
    if (f) f.addEventListener('submit', e => { e.preventDefault(); location.hash = '#/search/' + encodeURIComponent(f.q.value.trim()); });
  }

  function questions() {
    document.title = 'Questions · Contradiction';
    app.innerHTML = '<h1>Big questions</h1><p class="lede">Where the faiths disagree, with each side in its own words and the passages behind it.</p>' +
      '<div class="section-head"><h2>Where they disagree</h2></div>' + questionCards(C.questions.filter(isDispute)) +
      '<div class="section-head"><h2>Hard questions</h2></div>' + questionCards(C.questions.filter(q => !isDispute(q)));
  }

  function topics() {
    document.title = 'Topics · Contradiction';
    const sorted = [...G.topics].sort((a, b) => a.title.localeCompare(b.title));
    app.innerHTML = '<h1>Explore</h1>' + exploreGrid() + '<h2>Topics</h2><p class="lede">Each topic shows what Christians, Muslims and Jews believe, and where it is in their texts.</p>' +
      '<div class="topic-grid">' + sorted.map(t => '<a href="#/t/' + t.id + '">' + esc(t.title) + '</a>').join('') + '</div>' +
      '<div class="section-head"><h2>Reading guides</h2></div><ul class="cards two">' + C.topics.map(t =>
        '<li><a href="#/topic/' + t.slug + '"><strong>' + esc(t.title) + '</strong><span>' + esc(t.blurb) + '</span></a></li>').join('') + '</ul>';
  }

  function topic(slug) {
    const t = C.topics.find(x => x.slug === slug);
    if (!t) return notFound();
    document.title = t.title + ' · Contradiction';
    const qs = t.questions.map(s => C.questions.find(q => q.slug === s)).filter(Boolean);
    app.innerHTML = '<p class="crumbs"><a href="#/topics">Topics</a></p><h1>' + esc(t.title) + '</h1><p class="lede">' + esc(t.blurb) + '</p>' +
      '<div class="section-head"><h2>Questions</h2></div>' + questionCards(qs) +
      (t.passages.length ? '<div class="section-head"><h2>Key passages</h2></div><ul class="booklist">' + t.passages.map(p => {
        const r = parseRef(p); return '<li><a href="' + refHref(r) + '">' + esc(p) + '</a></li>';
      }).join('') + '</ul>' : '');
  }

  function question(slug) {
    const q = C.questions.find(x => x.slug === slug);
    if (!q) return notFound();
    document.title = q.title + ' · Contradiction';
    const groups = ['all', 'christian', 'muslim', 'jewish', 'critics'].filter(g => g === 'all' ||
      q.sections.some(s => (VIEW_GROUP[s.view] || s.view) === g));
    if (!groups.includes(viewFilter) || lastQ !== slug) viewFilter = 'all';
    lastQ = slug;
    const shown = q.sections.filter(s => viewFilter === 'all' || s.view === 'overview' || (VIEW_GROUP[s.view] || s.view) === viewFilter);
    app.innerHTML = '<p class="crumbs"><a href="#/">Home</a> › <a href="#/questions">Questions</a></p>' +
      '<h1>' + esc(q.title) + '</h1>' +
      (isDispute(q) ? '<p class="asked">The dispute: ' + esc(q.asked) + '</p>' : '<p class="asked">Asked as: “' + esc(q.asked) + '”</p>') +
      '<p class="lede">' + rich(q.short) + '</p>' +
      '<div class="chips" role="group" aria-label="Show views">' + groups.map(g =>
        '<button class="chip" data-g="' + g + '" aria-pressed="' + (g === viewFilter) + '">' +
        (g === 'all' ? 'All views' : esc(C.views[g])) + '</button>').join('') + '</div>' +
      shown.map(s => '<section class="sec v-' + s.view + '"><span class="tag">' + esc(C.views[s.view]) + '</span><h2>' + esc(s.h) + '</h2>' +
        s.body.map(b => Array.isArray(b) ? '<ul>' + b.map(i => '<li>' + rich(i) + '</li>').join('') + '</ul>'
          : b.quote ? '<blockquote class="vq" data-quote="' + esc(b.quote) + '">…</blockquote>'
          : '<p>' + rich(b) + '</p>').join('') + '</section>').join('') +
      (q.sources.length ? '<h3>Sources outside the Bible</h3><ul class="small muted">' + q.sources.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>' : '') +
      '<p class="status">Draft answer. Not yet reviewed by a priest or scholar. Verse quotations are shown in the ' + esc(trById[tr].name) + '.</p>';
    app.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { viewFilter = b.dataset.g; question(slug); }));
    app.querySelectorAll('[data-quote]').forEach(async el => {
      const r = parseRef(el.dataset.quote);
      try {
        // Verse numbering differs in a few places (e.g. Douay-Rheims Judges 21), so fall back if the verse is absent.
        let t, vs = '';
        for (t of [trFor(r.code)].concat(M.translations.map(x => x.id).filter(x => has(x, r.code)))) {
          const book = await loadBook(t, r.code);
          vs = (book[r.ch - 1] || []).slice(r.v1 - 1, r.v2).join(' ').trim();
          if (vs) break;
        }
        el.innerHTML = esc(vs) + '<cite><a href="' + refHref(r) + '">' + esc(el.dataset.quote) + '</a> · ' + esc(trById[t].name) + '</cite>';
      } catch (e) { el.textContent = el.dataset.quote; }
    });
  }

  /* Whose Bible: the same scriptures, as each tradition counts and orders them */
  const OT39 = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL'.split(' ');
  const TWELVE = 'HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL'.split(' ');
  const CANONS = {
    protestant: { name: 'Protestant', eds: ['KJV', 'WEB', 'WLC', 'TR', 'BYZ'], note: 'The 66 books. Protestants keep the Old Testament of the Hebrew Bible; the extra Greek books are called the Apocrypha, printed in some Bibles (like the 1611 King James) but not counted as Scripture.',
      parts: [['Old Testament · 39 books', OT39]] },
    catholic: { name: 'Catholic', eds: ['DRC', 'WEB', 'VUL', 'WLC', 'BYZ'], note: 'The 73 books defined by the Council of Trent (1546). Seven Old Testament books (the deuterocanon) and the Greek parts of Esther and Daniel are Scripture for Catholics.',
      parts: [['Old Testament · 46 books', 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH TOB JDT EST 1MA 2MA JOB PSA PRO ECC SOL WIS SIR ISA JER LAM BAR EZE DAN'.split(' ').concat(TWELVE)],
        ['Greek parts of Esther and Daniel', 'ESG DNG S3Y SUS BEL'.split(' ')]] },
    orthodox: { name: 'Orthodox', eds: ['WEB', 'LXX', 'BYZ'], note: 'The Orthodox Old Testament follows the Greek Septuagint: the Catholic books plus 1 Esdras, 3 Maccabees, the Prayer of Manasseh and Psalm 151, with 4 Maccabees as an appendix. Its order puts the twelve minor prophets before Isaiah.',
      parts: [['Old Testament (Septuagint) · 49 books', 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH PRM 1ES EZR NEH TOB JDT EST 1MA 2MA 3MA PSA PSX JOB PRO ECC SOL WIS SIR'.split(' ').concat(TWELVE, 'ISA JER BAR LAM EPJ EZE DAN'.split(' '))],
        ['Appendix and Greek additions', '4MA ESG DNG S3Y SUS BEL'.split(' ')]] },
  };
  const TORAH = {
    jewish: { name: 'Jewish', eds: ['JPS', 'WLC'], jewish: true, note: 'The Tanakh: the same books as the Protestant Old Testament, counted as 24 and arranged in three parts, Torah (Teaching), Nevi’im (Prophets) and Ketuvim (Writings). Jews do not accept the New Testament. The Oral Torah (Mishnah and Talmud) is in the Library.',
      parts: [['Torah · the five books of Moses', 'GEN EXO LEV NUM DEU'.split(' ')], ['Nevi’im · the Prophets', 'JOS JDG 1SA 2SA 1KI 2KI ISA JER EZE'.split(' ').concat(TWELVE)],
        ['Ketuvim · the Writings', 'PSA PRO JOB SOL RUT LAM ECC EST DAN EZR NEH 1CH 2CH'.split(' ')]] },
  };
  const ORAL = ['Mishnah', 'Babylonian Talmud', 'Jerusalem Talmud', 'Tosefta', 'Midrash', 'Targum (Aramaic Bible translations)', 'Mishneh Torah (Maimonides)', 'Shulchan Arukh', 'Commentaries on the Hebrew Bible'];
  // which tradition the edition picker offers: the one last chosen on the Read page
  const readScope = corpus => corpus === 'quran' ? ISLAM[store.get('branch')] || ISLAM.sunni : store.get('torah') === '1' ? TORAH.jewish : CANONS[store.get('canon')] || CANONS.protestant;
  const NT27 = 'MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV'.split(' ');
  const ISLAM = {
    sunni: { name: 'Sunni', eds: ['PICK', 'YALI', 'HAFS', 'WARSH', 'QALUN', 'DURI', 'SHUBA', 'BAZZI', 'QUNBUL', 'SUSI', 'RODW', 'PALM', 'SALE'], hadith: 'Sunni hadith', note: 'About 85–90% of Muslims. The Quran is the same text for Sunni and Shia Muslims. Sunnis rely on the six hadith books (Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasa’i, Ibn Majah) and the Muwatta of Malik.',
      links: [['lib/c/Sunni hadith', 'Sunni hadith collections'], ['lib/c/Quran commentary (tafsir)', 'Quran commentaries (tafsir)']] },
    shia: { name: 'Shia', eds: ['SHAK', 'HAFS', 'RODW', 'PALM', 'SALE'], hadith: 'Shia hadith and teachings', note: 'About 10–15% of Muslims, mostly Twelver Shia (Iran, Iraq, Lebanon, Bahrain). Same Quran; their hadith come through the Prophet’s family and the twelve Imams, in books such as al-Kafi by al-Kulayni.',
      links: [['lib/c/Shia hadith and teachings', 'Shia hadith and teachings (al-Kafi and more)'], ['lib/c/Quran commentary (tafsir)', 'Quran commentaries (tafsir)']] },
  };
  async function books(t, view) {
    if (!trById[t]) t = tr;
    await loadLib();
    const EX = await getJSON('content/extra.json').catch(() => ({}));
    const quran = trById[t].corpus === 'quran', torah = !quran && view === 'jewish';
    const set = quran ? ISLAM : torah ? TORAH : CANONS;
    if (!set[view]) view = store.get(quran ? 'branch' : 'canon');
    if (!set[view]) view = Object.keys(set).find(k => set[k].eds.includes(t)) || Object.keys(set)[0];
    if (!quran) { store.set('torah', torah ? '1' : '0'); if (!torah) store.set('canon', view); } else store.set('branch', view);
    const c = set[view];
    if (!c.eds.includes(t)) t = c.eds[0];
    setTr(t);
    const bibleT = CANONS[store.get('canon')] && CANONS[store.get('canon')].eds.includes(pref.bible) ? pref.bible : (CANONS[store.get('canon')] || CANONS.protestant).eds[0];
    document.title = (quran ? 'The Quran' : torah ? 'The Torah' : c.name + ' Bible') + ' · Contradiction';
    let h = '<p class="crumbs">Read</p><div class="seg even">' +
      '<a href="#/books/' + bibleT + '/' + (store.get('canon') || 'protestant') + '"' + (!quran && !torah ? ' class="on"' : '') + '>Bible</a>' +
      '<a href="#/books/' + pref.quran + '/' + (store.get('branch') || 'sunni') + '"' + (quran ? ' class="on"' : '') + '>Quran</a>' +
      '<a href="#/books/' + (torah ? t : 'JPS') + '/jewish"' + (torah ? ' class="on"' : '') + '>Torah</a></div>' +
      '<h1>' + (quran ? 'The Quran' : torah ? 'The Torah and Hebrew Bible' : 'The Bible') + '</h1>';
    if (!torah) h += '<div class="seg even canon">' + Object.entries(set).map(([k, v]) => '<a href="#/books/' + (v.eds.includes(t) ? t : v.eds[0]) + '/' + k + '"' + (k === view ? ' class="on"' : '') + '>' + v.name + '</a>').join('') + '</div>';
    h += '<p class="lede" style="font-size:1rem">' + esc(c.note) + '</p><div class="reader-bar">' + pickerBtn(t) + '</div><p class="muted small">' + esc(trById[t].tradition) + '. ' + esc(trById[t].licence) + '</p>';
    const li = code => '<li><a href="#/read/' + t + '/' + code + '">' + esc(bookName[code]) + (has(t, code) ? '' : ' <span class="muted small">·&nbsp;' + esc(trById[trFor(code)].id) + '</span>') + '</a></li>';
    const works = col => L.filter(w => w.c === col).map(w => '<a href="#/lib/' + w.id + '">' + esc(w.t) + '</a>').join('');
    if (quran) {
      h += '<div class="seg even jump"><a href="javascript:void 0" data-jump="surahs">Quran</a><a href="javascript:void 0" data-jump="hadith">Hadith</a><a href="javascript:void 0" data-jump="tafsir">Tafsir</a></div>' +
        '<h2 id="hadith">' + (view === 'shia' ? 'Shia hadith' : 'Sunni hadith') + '</h2><div class="topic-grid">' + works(c.hadith) + '</div>' +
        '<h2 id="surahs">The 114 surahs</h2><ul class="booklist">' + trById[t].books.map(b => '<li><a href="#/read/' + t + '/' + b[0] + '">' + esc(bookName[b[0]]) + '</a></li>').join('') + '</ul>' +
        '<h2 id="tafsir">Quran commentary (tafsir)</h2><div class="topic-grid">' + works('Quran commentary (tafsir)') + '</div>';
    } else {
      for (const [title, list] of c.parts) h += '<h2>' + title + '</h2><ul class="booklist">' + list.filter(x => bookName[x]).map(li).join('') + '</ul>';
      if (torah) h += '<h2>The Oral Torah and rabbinic writings</h2><div class="topic-grid">' + ORAL.map(col => '<a href="#/lib/c/' + encodeURIComponent(col) + '">' + esc(col) + ' →</a>').join('') + '</div>';
      else h += '<h2>New Testament · 27 books</h2><ul class="booklist">' + NT27.map(li).join('') + '</ul>';
      const extra = (EX[torah ? 'torah' : 'bible'] || []);
      if (extra.length) h += '<h2>' + (torah ? 'Books outside the Hebrew Bible' : 'Books outside the Bible') + '</h2><p class="small muted">' + (torah ? 'Ancient Jewish writings that are not in the Tanakh.' : 'Early Christian writings that did not make it into the New Testament: gospels of Jesus’s childhood, lives of Peter, Paul and the other apostles, and the first church letters. No church counts these as Scripture.') + '</p>' +
        extra.map(([title, items]) => '<h3>' + esc(title) + '</h3><div class="extra-list">' + items.map(([path, label, note]) => '<a href="#/' + encodeURI(path) + '"><strong>' + esc(label) + '</strong><span>' + esc(note) + '</span></a>').join('') + '</div>').join('');
      h += '<p class="small muted">Books marked with an edition name are not in the ' + esc(trById[t].name) + ' and open in that edition instead.</p>';
    }
    app.innerHTML = h;
    app.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', () => document.getElementById(a.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' })));
    bindPicker();
  }

  async function read(t, code, ch, vs) {
    if (!trById[t] || !bookName[code]) return notFound();
    let note = '';
    if (!has(t, code)) {  // e.g. the Septuagint has no New Testament
      note = '<p class="status">The ' + esc(trById[t].name) + ' does not include ' + esc(bookName[code]) + '. Showing the ' + esc(trById[trFor(code)].name) + ' instead.</p>';
      t = trFor(code);
      history.replaceState(null, '', '#/read/' + [t, code, ch, vs].filter(Boolean).join('/'));
    }
    setTr(t);
    const n = trById[t].chapters[code], id = renderId, lang = trById[t].lang;
    const crumbs = '<div class="reader-bar"><p class="crumbs" style="margin:0;flex:1"><a href="#/books/' + t + '">' + (trById[t].corpus === 'quran' ? 'Quran' : 'Bible') + '</a> › <a href="#/read/' + t + '/' + code + '">' + esc(bookName[code]) + '</a></p>' + pickerBtn(t) + '</div>';
    if (!ch && n > 1) {
      document.title = bookName[code] + ' · Contradiction';
      app.innerHTML = crumbs + '<h1>' + esc(bookName[code]) + '</h1><ul class="chlist">' +
        Array.from({ length: n }, (_, i) => '<li><a href="#/read/' + t + '/' + code + '/' + (i + 1) + '">' + (i + 1) + '</a></li>').join('') + '</ul>';
      bindPicker();
      return;
    }
    ch = Math.min(Math.max(+ch || 1, 1), n);
    const book = await loadBook(t, code);
    if (id !== renderId) return;
    const [a, b] = (vs || '').split('-').map(Number), v1 = a || 0, v2 = b || v1;
    const head = esc(bookName[code]) + (n > 1 ? ' ' + ch : '');
    document.title = bookName[code] + (n > 1 ? ' ' + ch : '') + ' · ' + t;
    const link = c => '#/read/' + t + '/' + code + '/' + c;
    app.innerHTML = crumbs + note + '<h1>' + head + '</h1>' +
      (WBW_LANG(code) ? '<div class="reader-tools"><button class="chip' + (interlinear ? '" aria-pressed="true' : '') + '" data-wbw>' + LANG_NAME[WBW_LANG(code)] + ' word by word</button><span class="muted small">Tap a verse to compare translations and see the original.</span></div>' : '<p class="muted small">Tap a verse to compare translations.</p>') + '<div class="chapter' + (RTL[lang] ? ' rtl' : '') + '" lang="' + lang + '"' + (RTL[lang] ? ' dir="rtl"' : '') + '>' +
      book[ch - 1].map((txt, i) => txt ? '<p data-v="' + (i + 1) + '"' + (i + 1 >= v1 && i + 1 <= v2 ? ' class="sel"' : '') +
        '><sup>' + (i + 1) + '</sup>' + esc(txt) + '</p>' : '').join('') + '</div>' +
      '<div class="pager">' + (ch > 1 ? '<a class="btn ghost" href="' + link(ch - 1) + '">← Chapter ' + (ch - 1) + '</a>' : '<span></span>') +
      (ch < n ? '<a class="btn ghost" href="' + link(ch + 1) + '">Chapter ' + (ch + 1) + ' →</a>' : '') + '</div>';
    bindPicker();
    const wb = app.querySelector('[data-wbw]');
    if (wb) wb.addEventListener('click', () => { interlinear = !interlinear; store.set('interlinear', interlinear ? '1' : '0'); route(); });
    const box = app.querySelector('.chapter');
    if (interlinear && WBW_LANG(code)) loadWbw(code).then(wbw => {
      if (!wbw || id !== renderId) return;
      const lang = WBW_LANG(code), chw = wbw[corpusOf(code) === 'quran' ? 0 : ch - 1] || [];
      box.querySelectorAll('p[data-v]').forEach(p => { const ws = chw[+p.dataset.v - 1]; if (ws && ws.length) p.insertAdjacentHTML('beforeend', wordsHtml(ws, lang)); });
      box.insertAdjacentHTML('afterend', '<p class="small muted">' + esc(WBW_CREDIT[lang]) + '</p>');
    });
    box.addEventListener('click', e => {
      const p = e.target.closest('p[data-v]');
      if (!p) return;
      box.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
      p.classList.add('sel');
      history.replaceState(null, '', link(ch) + '/' + p.dataset.v);
      compare(t, code, ch, +p.dataset.v, p);
    });
    const first = box.querySelector('.sel');
    if (first) { first.scrollIntoView({ block: 'center' }); if (v1 === v2) compare(t, code, ch, v1, first); }
  }

  async function compare(t, code, ch, v, after) {
    app.querySelectorAll('.cmp').forEach(x => x.remove());
    // Next to an English Quran show the other English ones plus the standard Arabic; the other Arabic readings show when reading Arabic.
    const others = M.translations.filter(x => x.id !== t && has(x.id, code) &&
      (x.corpus !== 'quran' || x.lang !== 'ar' || x.id === 'HAFS' || trById[t].lang === 'ar'));
    if (!others.length) return;
    const dl = document.createElement('dl');
    dl.className = 'cmp';
    after.after(dl);
    const rows = await Promise.all(others.map(async o => {
      const bk = await loadBook(o.id, code).catch(() => []);
      const txt = (bk[ch - 1] || [])[v - 1];
      return '<dt>' + esc(o.name) + '</dt><dd lang="' + o.lang + '" dir="auto">' + (txt ? esc(txt) : '<span class="muted">Not at this verse number.</span>') + '</dd>';
    }));
    const wbw = await loadWbw(code), lang = WBW_LANG(code);
    const ow = wbw && (wbw[corpusOf(code) === 'quran' ? 0 : ch - 1] || [])[v - 1];
    const orig = ow && ow.length && !interlinear ? '<div class="orig-block"><strong class="small">Original ' + LANG_NAME[lang] + ', word by word</strong>' + wordsHtml(ow, lang) + trNote(ow) +
      '<p class="small muted">' + esc(WBW_CREDIT[lang]) + '. Tap and hold a word for its dictionary form.</p></div>' : '';
    dl.innerHTML = orig + '<strong class="small">' + esc(bookName[code]) + ' ' + (trById[t].chapters[code] > 1 ? ch + ':' : 'verse ') + v + ' in other editions</strong>' + rows.join('') +
      (corpusOf(code) === 'bible' ? '<p class="muted small">Chapter and verse numbers sometimes differ between traditions, most of all in the Psalms.</p>' : '');
  }


  /* ---------- original languages, word by word (wbw/) ---------- */
  const WBW_LANG = code => bookGroup[code] === 'quran' ? 'ar' : bookGroup[code] === 'nt' ? 'el' : bookGroup[code] === 'ot' ? 'he' : null;
  const LANG_NAME = { he: 'Hebrew', el: 'Greek', ar: 'Arabic' };
  const WBW_CREDIT = { he: 'Hebrew: Leningrad Codex, word meanings from STEPBible (Tyndale House, CC BY 4.0)', el: 'Greek: NA28 with Textus Receptus variants, word meanings from STEPBible (Tyndale House, CC BY 4.0)', ar: 'Arabic: Uthmani text, word meanings from Quran.com' };
  const wbwCache = new Map();
  const loadWbw = code => {
    const l = WBW_LANG(code);
    if (!l) return Promise.resolve(null);
    const k = l + '/' + code;
    if (!wbwCache.has(k)) wbwCache.set(k, getJSON('wbw/' + k + '.json').catch(() => null));
    return wbwCache.get(k);
  };
  const wordsHtml = (words, lang) => '<div class="wbw" dir="' + (lang === 'el' ? 'ltr' : 'rtl') + '">' + words.map(w =>
    '<span class="w' + (w[5] ? ' tr' : '') + '" title="' + esc((w[3] ? w[3] + ' · ' : '') + (w[4] || '') + (w[5] ? ' · only in later manuscripts (Textus Receptus / KJV)' : '')) + '">' +
    '<b lang="' + lang + '">' + esc(w[0]) + '</b><i>' + esc(w[1]) + '</i><em>' + esc(w[2]) + '</em></span>').join('') + '</div>';
  const trNote = words => words.some(w => w[5]) ? '<p class="small muted">Words with a dotted border are found only in later manuscripts (the Textus Receptus behind the King James Version), not in the oldest Greek copies.</p>' : '';
  let interlinear = store.get('interlinear') === '1';

  /* ---------- search across everything ---------- */
  let smode = 'all', SM, buckets = new Map();
  const modeChips = () => '<div class="chips">' + [['all', 'Everything'], ['edition', 'Only: ' + trById[tr].name.replace(/^Quran: /, '')]].map(([k, v]) =>
    '<button class="chip" data-m="' + k + '" aria-pressed="' + (k === smode) + '">' + esc(v) + '</button>').join('') + '</div>';
  const bindMode = q => app.querySelectorAll('.chip[data-m]').forEach(b => b.addEventListener('click', () => { smode = b.dataset.m; search(q); }));
  const loadSM = () => SM ? Promise.resolve(SM) : getJSON('search/meta.json').then(d => { d.stopSet = new Set(d.stop); SM = d; return d; });
  const norm = s => s.toLowerCase().replace(/’/g, "'").normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const bucketOf = w => { let h = 2166136261; for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619) >>> 0; return h % SM.nb; };
  // Each bucket file is a run of [length][word][count][document ids as deltas]; numbers are 7-bit varints.
  async function postings(w) {
    const b = bucketOf(w);
    if (!buckets.has(b)) buckets.set(b, fetch('search/' + b + '.bin').then(r => r.arrayBuffer()).then(a => new Uint8Array(a)));
    const u = await buckets.get(b);
    let p = 0, c;
    const num = () => { let n = 0, sh = 0; do { c = u[p++]; n += (c & 127) * Math.pow(2, sh); sh += 7; } while (c & 128); return n; };
    while (p < u.length) {
      const len = u[p++];
      let word = '';
      for (let i = 0; i < len; i++) word += String.fromCharCode(u[p + i]);
      p += len;
      const n = num();
      if (word === w) { const out = new Uint32Array(n); let prev = 0; for (let i = 0; i < n; i++) out[i] = prev += num(); return out; }
      for (let i = 0; i < n; i++) num();
    }
    return new Uint32Array(0);
  }
  const intersect = (a, b) => { const out = []; let i = 0, j = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { out.push(a[i]); i++; j++; } else if (a[i] < b[j]) i++; else j++; } return out; };
  const snippet = (txt, terms, hl) => {
    const low = norm(txt), at = Math.max(0, Math.min(...terms.map(t => { const i = low.indexOf(t); return i < 0 ? 1e9 : i; }).filter(i => i < 1e9), 1e9) - 100);
    const start = at >= 1e9 - 100 ? 0 : at;
    return (start ? '…' : '') + esc(txt.slice(start, start + 380)).replace(hl, '<mark>$1</mark>') + (txt.length > start + 380 ? '…' : '');
  };

  async function search(q) {
    document.title = (q ? q + ' · ' : '') + 'Search · Contradiction';
    const r = q && parseRef(q);
    if (r && r.label.length === q.length && trFor(r.code)) { location.replace(refHref(r)); return; }
    if (smode === 'edition') return searchEdition(q);
    const id = renderId;
    app.innerHTML = '<h1>Search</h1>' + searchForm(q) + modeChips() + '<div id="res"></div>';
    bindSearch(); bindMode(q);
    const res = document.getElementById('res');
    if (!q) { res.innerHTML = '<p class="muted">Searches the English text of every scripture, hadith, commentary, creed and other work on the site. Put a phrase in "quotes" to match it exactly.</p>'; app.querySelector('input').focus(); return; }
    res.innerHTML = '<p class="loading">Searching…</p>';
    await Promise.all([loadSM(), loadLib()]);
    const phrase = /^".+"$/.test(q) ? norm(q.slice(1, -1)) : '';
    const all = norm(q).match(/[a-z]{2,24}|\d{3,4}/g) || [];
    const terms = [...new Set(all.filter(w => !SM.stopSet.has(w)))];
    const qhits = C.questions.filter(x => all.length && all.every(w => norm(x.title + ' ' + x.short + ' ' + x.asked).includes(w)));
    if (!terms.length) { res.innerHTML = '<p>Those words are too common to search for. Try a more specific word.</p>'; return; }
    const lists = await Promise.all(terms.map(postings));
    if (id !== renderId) return;
    let docs = Array.from(lists[0]);
    for (let i = 1; i < lists.length; i++) docs = intersect(docs, lists[i]);
    // Sort the documents into groups: each scripture edition, then each library collection.
    const groups = [], byKey = {};
    const grp = (key, label, faith) => byKey[key] || (groups.push(byKey[key] = { key, label, faith, docs: [], works: new Set() }), byKey[key]);
    const firstScr = SM.scr[0].first;
    let wi = 0;
    docs.forEach(d => {
      if (d >= firstScr) {
        const e = [...SM.scr].reverse().find(x => d >= x.first);
        let n = d - e.first, code, ch;
        for (const [c, k] of e.books) { if (n < k) { code = c; ch = n + 1; break; } n -= k; }
        grp('scr-' + e.tr, trById[e.tr].name.replace(/^Quran: /, 'Quran, '), trById[e.tr].corpus).docs.push({ tr: e.tr, code, ch });
      } else {
        while (wi < SM.works.length - 1 && SM.works[wi + 1][1] <= d) wi++;
        const w = L.find(x => x.id === SM.works[wi][0]);
        if (!w) return;
        const g = grp(w.c, w.c, w.f);
        g.docs.push({ w, part: d - SM.works[wi][1] }); g.works.add(w.id);
      }
    });
    const order = ['bible', 'quran', 'christian', 'islam', 'judaism'];
    groups.sort((a, b) => order.indexOf(a.faith) - order.indexOf(b.faith));
    const hl = new RegExp('(' + (phrase ? [phrase] : terms).map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    const HEAD = { bible: 'Scripture', quran: 'Scripture', christian: 'Christianity', islam: 'Islam', judaism: 'Judaism' };
    let lastHead = '';
    res.innerHTML = (qhits.length ? '<h2>Answers</h2>' + questionCards(qhits) : '') +
      '<p class="muted">' + (docs.length ? docs.length.toLocaleString() + ' sections contain ' + (terms.length > 1 ? 'all of these words' : 'this word') + '. Open a group to read the passages.' : 'Nothing found. Check the spelling, or try fewer words.') + '</p>' +
      groups.map((g, i) => {
        const head = HEAD[g.faith] !== lastHead ? '<h2>' + (lastHead = HEAD[g.faith]) + '</h2>' : '';
        return head + '<details class="grp" data-i="' + i + '"><summary><strong>' + esc(g.label) + '</strong> <span class="muted small">' + g.docs.length.toLocaleString() +
          (g.works.size > 1 ? ' sections in ' + g.works.size + ' works' : g.docs.length === 1 ? ' section' : ' sections') + '</span></summary><div class="hits"></div></details>';
      }).join('');
    // Passages are fetched only when a group is opened, eight sections at a time.
    const fill = async (el, g) => {
      const box = el.querySelector('.hits');
      const more = box.querySelector('button');
      if (more) more.remove();
      const batch = g.docs.splice(0, 8);
      const html = await Promise.all(batch.map(async d => {
        const has = t => { const low = norm(t); return phrase ? low.includes(phrase) : terms.every(w => low.includes(w)); };
        const any = t => { const low = norm(t); return terms.some(w => low.includes(w)); };
        if (d.tr) {
          const bk = await loadBook(d.tr, d.code), vs = bk[d.ch - 1] || [];
          let idx = vs.map((t, i) => has(t) ? i : -1).filter(i => i >= 0);
          if (!idx.length && !phrase) idx = vs.map((t, i) => any(t) ? i : -1).filter(i => i >= 0);
          const many = trById[d.tr].chapters[d.code] > 1;
          return idx.slice(0, 3).map(i => '<div class="hit"><a href="#/read/' + d.tr + '/' + d.code + '/' + d.ch + '/' + (i + 1) + '">' + esc(bookName[d.code]) + ' ' + (many ? d.ch + ':' : 'v. ') + (i + 1) +
            '</a><p>' + esc(vs[i]).replace(hl, '<mark>$1</mark>') + '</p></div>').join('');
        }
        const part = await loadPart(d.w.id, d.part);
        const text = it => (it.e || '') + ' ' + (it.h || '');
        let idx = part.items.map((it, i) => has(text(it)) ? i : -1).filter(i => i >= 0);
        if (!idx.length && !phrase) idx = part.items.map((it, i) => any(text(it)) ? i : -1).filter(i => i >= 0);
        return idx.slice(0, 2).map(i => '<div class="hit"><a href="#/lib/' + d.w.id + '/' + d.part + '/' + i + '">' + esc(d.w.t) + ' · ' + esc(part.t) + (part.items[i].n ? ' · ' + esc(part.items[i].n) : '') +
          '</a><p>' + snippet(part.items[i].e || part.items[i].h || '', phrase ? [phrase] : terms, hl) + '</p></div>').join('');
      }));
      box.insertAdjacentHTML('beforeend', html.join('') || (phrase && !box.children.length && !g.docs.length ? '<p class="muted small">The exact phrase does not occur here.</p>' : ''));
      if (g.docs.length) {
        const b = document.createElement('button');
        b.className = 'ghost'; b.textContent = 'Show more (' + g.docs.length.toLocaleString() + ' sections left)';
        b.addEventListener('click', () => fill(el, g));
        box.appendChild(b);
      }
    };
    res.querySelectorAll('details.grp').forEach((el, i) => {
      el.addEventListener('toggle', () => { if (el.open && !el.dataset.done) { el.dataset.done = 1; fill(el, groups[el.dataset.i]); } });
      if (i < 3) el.open = true;
    });
  }

  let scope = 'all';
  async function searchEdition(q) {
    const id = renderId;
    app.innerHTML = '<h1>Search</h1>' + searchForm(q) + modeChips() +
      '<div class="chips">' + (trById[tr].corpus === 'quran' ? [] : [['all', 'Whole Bible']].concat(Object.entries(GROUPS).filter(([k]) => trById[tr].books.some(b => bookGroup[b[0]] === k)))).map(([k, v]) =>
        '<button class="chip" data-s="' + k + '" aria-pressed="' + (k === scope) + '">' + v + '</button>').join('') + '</div><div id="res"></div>';
    bindSearch(); bindMode(q);
    app.querySelectorAll('.chip[data-s]').forEach(b => b.addEventListener('click', () => { scope = b.dataset.s; search(q); }));
    const res = document.getElementById('res');
    if (!q) { res.innerHTML = '<p class="muted">Searching the ' + esc(trById[tr].name) + '. Put a phrase in "quotes" to match it exactly.</p>'; app.querySelector('input').focus(); return; }
    res.innerHTML = '<p class="loading">Searching the ' + esc(trById[tr].name) + '…</p>';
    const phrase = /^".+"$/.test(q), terms = phrase ? [q.slice(1, -1).toLowerCase()] : q.toLowerCase().split(/\s+/).filter(Boolean);
    let list = trById[tr].books.filter(b => scope === 'all' || bookGroup[b[0]] === scope);
    if (!list.length) list = trById[tr].books;
    const all = await Promise.all(list.map(b => loadBook(tr, b[0])));
    if (id !== renderId) return;
    const hits = []; let total = 0;
    all.forEach((bk, bi) => bk.forEach((vsl, ci) => vsl.forEach((txt, vi) => {
      const low = txt.toLowerCase();
      if (terms.every(w => low.includes(w))) { total++; if (hits.length < 300) hits.push([list[bi][0], ci + 1, vi + 1, txt]); }
    })));
    const hl = new RegExp('(' + terms.map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    const qhits = C.questions.filter(x => terms.every(w => (x.title + ' ' + x.short + ' ' + JSON.stringify(x.sections)).toLowerCase().includes(w)));
    res.innerHTML = (qhits.length ? '<h2>Answers</h2>' + questionCards(qhits) : '') +
      '<h2>' + total.toLocaleString() + ' verse' + (total === 1 ? '' : 's') + ' in the ' + esc(trById[tr].name) + '</h2>' +
      (total > hits.length ? '<p class="muted small">Showing the first ' + hits.length + '. Add a word or pick a section to narrow it.</p>' : '') +
      hits.map(h => '<div class="hit"><a href="#/read/' + tr + '/' + h[0] + '/' + h[1] + '/' + h[2] + '">' + esc(bookName[h[0]]) + ' ' + (trById[tr].chapters[h[0]] > 1 ? h[1] + ':' : 'v. ') + h[2] +
        '</a><p dir="auto">' + esc(h[3]).replace(hl, '<mark>$1</mark>') + '</p></div>').join('') +
      '<p class="muted small">This searches only the edition chosen at the top of the page, in any language.</p>';
  }

  async function about() {
    document.title = 'About · Contradiction';
    const id = renderId;
    const [lib, skipped] = await Promise.all([loadLib(), getJSON('lib/skipped.json').catch(() => [])]);
    if (id !== renderId) return;
    const count = f => lib.filter(w => w.f === f);
    const passages = lib.reduce((n, w) => n + w.items, 0);
    app.innerHTML = '<h1>About this site</h1>' +
      '<p>This site holds the source texts of Christianity, Islam and Judaism and answers hard questions about them. Every answer links to the texts it relies on, shows where traditions differ, and gives each faith\'s view in terms its own holders would recognise.</p>' +
      '<h2>What is stored</h2><ul>' +
      '<li>' + M.translations.filter(t => t.corpus === 'bible').length + ' editions of the Bible and ' + M.translations.filter(t => t.corpus === 'quran').length + ' of the Quran</li>' +
      '<li>' + lib.length + ' other works, about ' + (Math.round(passages / 1000) * 1000).toLocaleString() + ' passages: ' + count('christian').length + ' Christian, ' + count('islam').length + ' Islamic and ' + count('judaism').length + ' Jewish</li>' +
      '<li>' + C.questions.length + ' question and dispute pages, ' + B.traditions.length + ' belief summaries and ' + B.compare.length + ' comparison topics</li></ul>' +
      '<h2>Scripture editions</h2><table><tr><th>Edition</th><th>Tradition</th><th>Licence and source</th></tr>' + M.translations.map(t =>
        '<tr><td><a href="#/books/' + t.id + '">' + esc(t.name) + '</a><br><span class="muted small">' + esc(t.sub) + '</span></td><td>' + esc(t.tradition) + '</td><td class="small">' + esc(t.licence) + '</td></tr>').join('') + '</table>' +
      '<h2>Licences</h2><p>Each work in the <a href="#/lib">Library</a> states its source and licence at the foot of its pages. Three groups need attention before the site is made public or earns money:</p>' +
      '<ul><li>English translations of hadith, Sunni and Shia, and several modern Quran commentaries come from open datasets, but the translators\' rights have not been verified.</li>' +
      '<li>The main English Talmud and Mishneh Torah are licensed for non-commercial use only.</li>' +
      '<li>The Yusuf Ali and Shakir Quran translations have an unsettled copyright status.</li></ul>' +
      '<details class="plain"><summary>' + skipped.length + ' texts were left out because no open licence could be confirmed</summary><ul class="small muted">' +
      skipped.map(x => '<li>' + esc(x[0]) + ': ' + esc(x[1]) + '</li>').join('') + '</ul></details>' +
      '<p class="small muted">Also not included, because they are under copyright: modern Bible and Quran translations, the Catechism of the Catholic Church, the documents of Vatican II, and most modern books of all three faiths.</p>' +
      '<h2>Status of the answers</h2><p>The answers and belief summaries are first drafts. None has yet been reviewed by a priest, imam, rabbi or trained scholar, and each page says so until it has been.</p>' +
      '<h2>Ask</h2><p>The <a href="#/ask">Ask</a> page finds passages by matching the words of a question. It does not understand the question, so check what it returns. An AI-written answer built only from those passages can be switched on by whoever hosts the site; it needs a paid API key, and its answers must be checked against the linked sources like any other.</p>' +
      '<h2>Search</h2><p>The main search covers the English text of every work. The originals in Arabic, Hebrew, Greek and Latin can be searched one edition at a time, by choosing the edition at the top of the page.</p>';
  }

  /* ---------- library: hadith, Talmud, creeds, Fathers ---------- */
  const FAITHS = { christian: 'Christianity', islam: 'Islam', judaism: 'Judaism' };
  let L, tocs = new Map(), partCache = new Map();
  const loadLib = () => L ? Promise.resolve(L) : getJSON('lib/index.json').then(d => { L = d; return d; });
  const loadToc = id => { if (!tocs.has(id)) tocs.set(id, getJSON('lib/' + id + '/toc.json')); return tocs.get(id); };
  const loadPart = (id, n) => { const k = id + '/' + n; if (!partCache.has(k)) partCache.set(k, getJSON('lib/' + k + '.json')); return partCache.get(k); };
  const group = (list, key) => list.reduce((m, x) => { (m[x[key]] = m[x[key]] || []).push(x); return m; }, {});

  async function library(a) {
    const id0 = renderId;
    await loadLib();
    if (id0 !== renderId) return;
    if (!a[0]) return libHome();
    if (FAITHS[a[0]] || a[0] === 'c') return libHome(a[0] === 'c' ? a.slice(1).join('/') : null, FAITHS[a[0]] ? a[0] : null);
    const w = L.find(x => x.id === a[0]);
    if (!w) return notFound();
    if (a[1] === 'search') return libSearch(w, a.slice(2).join('/'));
    if (a[1] !== undefined) return libPart(w, +a[1], a[2]);
    return libWork(w);
  }

  function libHome(coll) {
    document.title = 'Library · Contradiction';
    if (coll) {
      const ws = L.filter(w => w.c === coll);
      if (!ws.length) return notFound();
      const subs = group(ws, 's');
      app.innerHTML = '<p class="crumbs"><a href="#/lib">Library</a> › ' + FAITHS[ws[0].f] + '</p><h1>' + esc(coll) + '</h1>' +
        Object.keys(subs).map(s => (s ? '<h2>' + esc(s) + '</h2>' : '') + '<ul class="cards two">' + subs[s].map(w =>
          '<li><a href="#/lib/' + w.id + '"><strong>' + esc(w.t) + '</strong><span>' + (w.a ? esc(w.a) + ' · ' : '') + w.items.toLocaleString() + ' passages</span></a></li>').join('') + '</ul>').join('');
      return;
    }
    const byFaith = group(L, 'f');
    app.innerHTML = '<h1>Library</h1><p class="lede">The source texts beyond the scriptures themselves. Every work names where its text came from and what licence it carries.</p>' +
      Object.keys(FAITHS).filter(f => byFaith[f]).map(f => {
        const colls = group(byFaith[f], 'c');
        return '<h2>' + FAITHS[f] + '</h2><ul class="cards two">' + Object.keys(colls).map(c =>
          '<li><a href="#/lib/' + (colls[c].length === 1 ? colls[c][0].id : 'c/' + encodeURIComponent(c)) + '"><strong>' + esc(c) + '</strong><span>' +
          (colls[c].length === 1 ? esc(colls[c][0].t) : colls[c].length + ' works') + ' · ' + colls[c].reduce((n, w) => n + w.items, 0).toLocaleString() + ' passages</span></a></li>').join('') + '</ul>';
      }).join('') +
      '<p class="muted small">Scripture itself is under <a href="#/books">Read</a>: the Bible in English, Hebrew, Greek and Latin, and the Quran in six English translations and eight Arabic readings.</p>';
  }

  const libCrumbs = (w, last) => '<p class="crumbs"><a href="#/lib">Library</a> › <a href="#/lib/c/' + encodeURIComponent(w.c) + '">' + esc(w.c) + '</a>' +
    (last ? ' › <a href="#/lib/' + w.id + '">' + esc(w.t) + '</a>' : '') + '</p>';
  const libSearchForm = (w, q) => '<form class="searchbox" role="search"><input type="search" name="q" value="' + esc(q) + '" placeholder="Search within this work" aria-label="Search within this work"><button>Search</button></form>';
  const bindLibSearch = w => app.querySelector('form.searchbox').addEventListener('submit', e => {
    e.preventDefault(); location.hash = '#/lib/' + w.id + '/search/' + encodeURIComponent(e.target.q.value.trim()); });

  async function libWork(w) {
    const id = renderId, toc = await loadToc(w.id);
    if (id !== renderId) return;
    document.title = w.t + ' · Contradiction';
    app.innerHTML = libCrumbs(w) + '<h1>' + esc(w.t) + '</h1>' + (w.a ? '<p class="lede">' + esc(w.a) + '</p>' : '') + libSearchForm(w, '') +
      '<ul class="toc">' + toc.map((p, i) => '<li><a href="#/lib/' + w.id + '/' + i + '">' + esc(p[0]) + '</a> <span class="muted small">' + p[1] + '</span></li>').join('') + '</ul>' +
      '<p class="status">' + esc(w.l) + '</p>';
    bindLibSearch(w);
  }

  /* Hadith grades: how hadith scholars rate the chain of narrators. Bukhari and Muslim are accepted as sound as whole collections. */
  const GRADES = [[/^(sahih|saheeh)/i, 'sahih', 'Sahih · sound'], [/^hasan/i, 'hasan', 'Hasan · good'], [/^(very )?(da'?if|daeef|weak)/i, 'daif', 'Da’if · weak'], [/^(mawdu|maudu|fabricated)/i, 'mawdu', 'Mawdu’ · fabricated'],
    [/^munkar/i, 'daif', 'Munkar · rejected'], [/^shadh/i, 'daif', 'Shadh · anomalous'], [/^(mauquf|mawquf)/i, 'other', 'Mawquf · a Companion’s saying'], [/^maqtu/i, 'other', 'Maqtu’ · a Successor’s saying']];
  function gradeHtml(it, w) {
    if (!w || !/^hadith-/.test(w.id)) return it.g ? '<p class="muted small" dir="auto">' + esc(it.g) + '</p>' : '';
    if (/^hadith-(bukhari|muslim)$/.test(w.id)) return '<p class="grade"><span class="gr sahih">Sahih · sound</span> <span class="muted small">Sunni scholars accept this whole collection as sound.</span></p>';
    if (!it.g) return '';
    const g = GRADES.find(([rx]) => rx.test(it.g.trim()));
    return '<p class="grade">' + (g ? '<span class="gr ' + g[1] + '">' + g[2] + '</span> ' : '') + '<span class="muted small" dir="auto">' + esc(it.g) + '</span></p>';
  }
  const itemHtml = (it, i, w, sel) => (it.h ? '<h3>' + esc(it.h) + '</h3>' : '') +
    '<div class="item' + (sel ? ' sel' : '') + '" id="i' + i + '">' + (it.n ? '<span class="num">' + esc(it.n) + '</span>' : '') +
    (it.e ? '<p>' + rich(it.e) + '</p>' : '') +
    (it.o ? '<p class="orig" dir="auto" lang="' + (w.lang || '') + '">' + esc(it.o).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</p>' : '') +
    gradeHtml(it, w) + '</div>';

  async function libPart(w, n, sel) {
    const id = renderId, [toc, part] = await Promise.all([loadToc(w.id), loadPart(w.id, n)]);
    if (id !== renderId) return;
    document.title = part.t + ' · ' + w.t;
    const link = i => '#/lib/' + w.id + '/' + i;
    app.innerHTML = libCrumbs(w, true) + '<h1>' + esc(part.t) + '</h1><div class="items">' +
      part.items.map((it, i) => itemHtml(it, i, w, sel !== undefined && +sel === i)).join('') + '</div>' +
      '<div class="pager">' + (n > 0 ? '<a class="btn ghost" href="' + link(n - 1) + '">← Previous</a>' : '<span></span>') +
      (n < toc.length - 1 ? '<a class="btn ghost" href="' + link(n + 1) + '">Next →</a>' : '') + '</div>' +
      '<p class="status">' + esc(w.l) + '</p>';
    const s = app.querySelector('.item.sel');
    if (s) s.scrollIntoView({ block: 'center' });
  }

  async function libSearch(w, q) {
    const id = renderId, toc = await loadToc(w.id);
    if (id !== renderId) return;
    document.title = q + ' · ' + w.t;
    app.innerHTML = libCrumbs(w, true) + '<h1>Search: ' + esc(w.t) + '</h1>' + libSearchForm(w, q) + '<div id="res"><p class="loading">Searching…</p></div>';
    bindLibSearch(w);
    const res = document.getElementById('res');
    if (!q) { res.innerHTML = ''; return; }
    const phrase = /^".+"$/.test(q), terms = phrase ? [q.slice(1, -1).toLowerCase()] : q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = []; let total = 0;
    for (let i = 0; i < toc.length; i += 8) {          // a few files at a time
      const batch = await Promise.all(toc.slice(i, i + 8).map((_, k) => loadPart(w.id, i + k)));
      if (id !== renderId) return;
      batch.forEach((part, k) => part.items.forEach((it, j) => {
        const low = ((it.e || '') + ' ' + (it.o || '') + ' ' + (it.h || '')).toLowerCase();
        if (terms.every(t => low.includes(t))) { total++; if (hits.length < 200) hits.push([i + k, j, part.t, it]); }
      }));
      res.firstChild.textContent = 'Searching… ' + Math.min(i + 8, toc.length) + ' of ' + toc.length + ' sections';
    }
    const hl = new RegExp('(' + terms.map(t => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    res.innerHTML = '<h2>' + total.toLocaleString() + ' passage' + (total === 1 ? '' : 's') + '</h2>' +
      (total > hits.length ? '<p class="muted small">Showing the first ' + hits.length + '.</p>' : '') +
      hits.map(h => {
        const txt = h[3].e || h[3].o || '', at = Math.max(0, txt.toLowerCase().indexOf(terms[0]) - 120);
        return '<div class="hit"><a href="#/lib/' + w.id + '/' + h[0] + '/' + h[1] + '">' + esc(h[2]) + (h[3].n ? ' · ' + esc(h[3].n) : '') +
          '</a><p dir="auto">' + (at ? '…' : '') + esc(txt.slice(at, at + 420)).replace(hl, '<mark>$1</mark>') + (txt.length > at + 420 ? '…' : '') + '</p></div>';
      }).join('');
  }



  /* ---------- retrieval: passages that share words with a question ---------- */
  const QSTOP = new Set('does did do done tell says think thinks according mean means really ever true false right wrong explain between difference different happen happens happened get got make made many much thing things something anything someone people person religion religions faith faiths teach teaches teaching view views'.split(' '));
  const SYN = [['jesus', 'christ', 'isa'], ['god', 'allah', 'lord'], ['muhammad', 'mohammed', 'mahomet', 'muhammed'], ['mary', 'maryam'], ['moses', 'musa'],
    ['abraham', 'ibrahim'], ['prayer', 'pray', 'prayers', 'praying', 'salat'], ['fasting', 'fast', 'fasts', 'fasted'], ['charity', 'alms', 'almsgiving', 'zakat'],
    ['hell', 'gehenna', 'hellfire'], ['heaven', 'paradise'], ['forgiveness', 'forgive', 'forgiven', 'forgives', 'pardon'], ['sin', 'sins', 'sinned', 'sinner'],
    ['marriage', 'marry', 'married', 'wife', 'wives'], ['divorce', 'divorced'], ['war', 'fight', 'fighting', 'battle', 'jihad'], ['women', 'woman'],
    ['death', 'die', 'dies', 'dead', 'died'], ['afterlife', 'resurrection', 'hereafter'], ['crucified', 'crucify', 'crucifixion', 'cross'], ['trinity', 'triune'],
    ['pork', 'swine', 'pig'], ['alcohol', 'wine', 'drunk', 'intoxicants'], ['sabbath', 'shabbat'], ['messiah', 'christ', 'anointed'], ['satan', 'devil', 'iblis'],
    ['angels', 'angel'], ['prophet', 'prophets', 'messenger'], ['love', 'loves', 'loved'], ['enemy', 'enemies'], ['kill', 'killing', 'killed', 'slay', 'murder'],
    ['steal', 'stealing', 'theft', 'thief'], ['adultery', 'adulterer', 'fornication'], ['poor', 'needy', 'poverty'], ['judgment', 'judgement', 'judged'],
    ['baptism', 'baptize', 'baptized', 'baptised'], ['circumcision', 'circumcised', 'circumcise'], ['pilgrimage', 'hajj'], ['creation', 'created', 'creator'],
    ['soul', 'souls', 'spirit'], ['slave', 'slaves', 'slavery', 'bondman', 'servant'], ['jews', 'jew', 'jewish', 'israel'], ['christians', 'christian', 'nazarenes'],
    ['muslims', 'muslim', 'believers'], ['pope', 'papacy', 'bishop'], ['imam', 'imams', 'imamate'], ['scripture', 'scriptures', 'book'], ['faith', 'belief', 'believe', 'believes'],
    ['works', 'deeds'], ['grace', 'mercy'], ['repent', 'repentance', 'repents', 'teshuvah']];
  const variants = w => {
    const set = new Set([w, w + 's']);
    if (w.length > 3 && w.endsWith('s')) set.add(w.slice(0, -1));
    SYN.forEach(g => { if (g.includes(w)) g.forEach(x => set.add(x)); });
    return [...set];
  };
  // How many passages to take from each collection, so that every tradition is heard.
  const QUOTA = { 'scr-WEB': 4, 'scr-PICK': 4, 'Sunni hadith': 3, 'Shia hadith and teachings': 2, 'Quran commentary (tafsir)': 2 };
  // Passages that share words with a question, a few from each tradition: used when no guide topic fits.
  async function retrieve(q) {
    await Promise.all([loadSM(), loadLib()]);
    const words = [...new Set((norm(q).match(/[a-z]{2,24}|\d{3,4}/g) || []).filter(w => !SM.stopSet.has(w) && !QSTOP.has(w)))];
    const pages = C.questions.map(x => [x, words.filter(w => norm(x.title + ' ' + x.short + ' ' + x.asked).includes(w)).length])
      .filter(x => words.length && x[1] >= Math.max(1, Math.ceil(words.length / 2))).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
    if (!words.length) return null;
    // Score every section. A question word counts once (variants included) and weighs more the rarer it is;
    // it counts triple when it is in the section's title or headings; long sections are marked down.
    const groups = await Promise.all(words.map(async w => {
      const vs = variants(w), lists = await Promise.all(vs.map(postings)), heads = await Promise.all(vs.map(v => postings('T' + v)));
      return { vs, lists, heads, df: Math.max(1, ...lists.map(l => l.length)) };
    }));
    const N = SM.docs, count = new Uint8Array(N), score = new Float32Array(N);
    groups.forEach(g => {
      const seen = new Uint8Array(N), idf = Math.log(1 + N / g.df);
      g.lists.forEach(l => { for (let i = 0; i < l.length; i++) { const d = l[i]; if (!seen[d]) { seen[d] = 1; count[d]++; score[d] += idf; } } });
      g.heads.forEach(l => { for (let i = 0; i < l.length; i++) { const d = l[i]; if (seen[d] === 1) { seen[d] = 2; score[d] += 2 * idf; } } });
    });
    const need = groups.length <= 2 ? groups.length : Math.ceil(groups.length * 0.6);
    const rank = d => (count[d] >= groups.length ? 100 : 0) + score[d] / (1 + 0.25 * Math.log2(1 + (SM.len[d] || 0)));
    let cand = [];
    for (let d = 0; d < N; d++) if (count[d] >= need) cand.push(d);
    if (!cand.length) for (let d = 0; d < N; d++) if (count[d]) cand.push(d);
    cand.sort((a, b) => rank(b) - rank(a));
    // Take the best sections for each faith, a few from any one collection, so every tradition is heard.
    const firstScr = SM.scr[0].first, taken = {}, perFaith = {}, picked = [];
    const BUDGET = { bible: 4, quran: 4, christian: 6, islam: 6, judaism: 5 }, POOL = 3;   // read three times as many as will be shown
    for (const d of cand) {
      if (picked.length >= 25 * POOL) break;
      let key, loc;
      if (d >= firstScr) {
        const e = [...SM.scr].reverse().find(x => d >= x.first);
        let n = d - e.first, code, ch;
        for (const [c, k] of e.books) { if (n < k) { code = c; ch = n + 1; break; } n -= k; }
        key = 'scr-' + e.tr; loc = { tr: e.tr, code, ch, faith: trById[e.tr].corpus };
      } else {
        let lo = 0, hi = SM.works.length - 1;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (SM.works[m][1] <= d) lo = m; else hi = m - 1; }
        const w = L.find(x => x.id === SM.works[lo][0]);
        if (!w || /arabic$/.test(w.id)) continue;
        key = w.c; loc = { w, part: d - SM.works[lo][1], faith: w.f };
      }
      if ((perFaith[loc.faith] || 0) >= BUDGET[loc.faith] * POOL || (taken[key] || 0) >= (QUOTA[key] || 2) * POOL) continue;
      taken[key] = (taken[key] || 0) + 1; perFaith[loc.faith] = (perFaith[loc.faith] || 0) + 1; loc.key = key; picked.push(loc);
    }
    // Open each candidate section and score its passages: question words present, exact phrases from the
    // question ("son of god"), and whether the passage sits under a heading that names the subject.
    const toks = norm(q).match(/[a-z0-9]+/g) || [], isContent = w => words.includes(w), phrases = [];
    for (let n = 4; n >= 2; n--) for (let i = 0; i + n <= toks.length; i++) {
      const g = toks.slice(i, i + n);
      if (isContent(g[0]) && isContent(g[n - 1]) && !phrases.some(ph => ph.includes(g.join(' ')))) phrases.push(g.join(' '));
    }
    const pscore = (t, head) => {
      const low = norm(t), n = groups.filter(g => g.vs.some(v => low.includes(v))).length;
      return n ? n + 3 * phrases.filter(ph => low.includes(ph)).length + 2 * (head || 0) + Math.min(1, 300 / (t.length + 1)) : 0;
    };
    const top = (texts, heads) => texts.reduce((b, t, i) => { const sc = t ? pscore(t, heads && heads[i]) : 0; return sc > b[1] ? [i, sc] : b; }, [0, 0]);
    const scored = (await Promise.all(picked.map(async p => {
      if (p.tr) {
        const vs = (await loadBook(p.tr, p.code))[p.ch - 1] || [], [i, sc] = top(vs);
        if (!sc) return null;
        const many = trById[p.tr].chapters[p.code] > 1, text = vs.slice(i, i + 2).join(' ');
        return { sc, key: p.key, faith: p.faith, source: bookName[p.code].replace(/^\d+\. /, 'Quran, ') + ' ' + (many ? p.ch + ':' : 'verse ') + (i + 1) + ' (' + trById[p.tr].name.replace(/^Quran: /, '') + ')',
          text, href: '#/read/' + p.tr + '/' + p.code + '/' + p.ch + '/' + (i + 1) };
      }
      const part = await loadPart(p.w.id, p.part);
      let head = 0;
      const heads = part.items.map(it => { if (it.h) head = groups.filter(g => g.vs.some(v => norm(it.h).includes(v))).length; return head; });
      const [i, sc] = top(part.items.map(it => it.e || ''), heads);
      if (!sc) return null;
      const it = part.items[i], low = norm(it.e), at = Math.max(0, Math.min(...groups.flatMap(g => g.vs.map(v => low.indexOf(v))).filter(x => x >= 0)) - 200);
      return { sc, key: p.key, faith: p.faith, source: p.w.t + (p.w.a ? ', ' + p.w.a : '') + ' · ' + part.t + (it.n ? ' · ' + it.n : ''),
        text: (at ? '…' : '') + it.e.slice(at, at + 1400) + (it.e.length > at + 1400 ? '…' : ''), href: '#/lib/' + p.w.id + '/' + p.part + '/' + i };
    }))).filter(Boolean).sort((a, b) => b.sc - a.sc);
    const used = {}, usedFaith = {};
    const passages = scored.filter(p => {
      if ((usedFaith[p.faith] || 0) >= BUDGET[p.faith] || (used[p.key] || 0) >= (QUOTA[p.key] || 2)) return false;
      used[p.key] = (used[p.key] || 0) + 1; usedFaith[p.faith] = (usedFaith[p.faith] || 0) + 1;
      return true;
    });
    const order = ['bible', 'quran', 'christian', 'islam', 'judaism'];
    passages.sort((a, b) => order.indexOf(a.faith) - order.indexOf(b.faith));
    return { passages, words, pages };
  }

  /* ---------- topic guide: passages, matching, answers ---------- */
  const talmudOne = new RegExp('^' + talmudRe.source.replace(/^\\b/, ''));
  const hadithOne = new RegExp('^(' + Object.keys(HADITH).join('|') + ') (\\d+)$');
  const KIND = { ot: 'Old Testament', dc: 'Deuterocanon (Catholic & Orthodox Bibles)', nt: 'New Testament', quran: 'Quran', hadith: 'Hadith',
    'islam-docs': 'Islamic commentary and texts', jewish: 'Jewish writings', 'christian-docs': 'Creeds and Church writings', other: 'Other' };
  const KIND_ORDER = { all: ['ot', 'nt', 'dc', 'quran', 'hadith', 'islam-docs', 'jewish', 'christian-docs', 'other'],
    christian: ['ot', 'nt', 'dc', 'christian-docs', 'quran', 'hadith', 'islam-docs', 'jewish', 'other'],
    muslim: ['quran', 'hadith', 'islam-docs', 'ot', 'nt', 'dc', 'jewish', 'christian-docs', 'other'],
    jewish: ['ot', 'jewish', 'nt', 'dc', 'quran', 'hadith', 'islam-docs', 'christian-docs', 'other'] };
  const linkParts = ref => /^\[\[([^|\]]+)\|([^\]]+)\]\]$/.exec(ref);
  function refKind(ref) {
    const l = linkParts(ref);
    if (l) return /tafsir|shia-|hadith-/.test(l[1]) ? 'islam-docs' : /sef-/.test(l[1]) ? 'jewish' : 'christian-docs';
    if (hadithOne.test(ref)) return 'hadith';
    if (/^Mishnah /.test(ref) || talmudOne.test(ref)) return 'jewish';
    const r = parseRef(ref);
    if (!r) return 'other';
    const g = bookGroup[r.code];
    return g === 'quran' ? 'quran' : g === 'nt' ? 'nt' : g === 'dc' ? 'dc' : 'ot';
  }
  function refLink(ref) {
    const l = linkParts(ref);
    if (l) return '#/' + encodeURI(l[1]);
    let m = hadithOne.exec(ref);
    if (m) return '#/go/' + HADITH[m[1]] + '/' + m[2];
    m = /^Mishnah ([A-Z][a-z]+(?: [A-Z][a-z]+)?) (\d+:\d+)/.exec(ref);
    if (m) return '#/go/' + mishnahWork(m[1]) + '/' + m[2];
    m = talmudOne.exec(ref);
    if (m) return '#/go/sef-' + slugify(m[1]) + '/' + m[2];
    const r = parseRef(ref);
    return r ? refHref(r) : '#/search/' + encodeURIComponent(ref);
  }
  const refLabel = ref => { const l = linkParts(ref); return l ? l[2] : ref; };
  // The words of a passage: verses from the Bible or Quran, or a hadith by number. Other sources are links only.
  async function quoteText(ref) {
    const cut = (s, n) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
    const m = hadithOne.exec(ref);
    if (m) {
      const id = HADITH[m[1]], nums = await getJSON('lib/' + id + '/nums.json');
      const at = nums[m[2]];
      if (!at) return null;
      const it = (await loadPart(id, at[0])).items[at[1]];
      return it && it.e ? cut(it.e, 420) : null;
    }
    if (linkParts(ref) || /^Mishnah /.test(ref) || talmudOne.test(ref)) return null;
    const r = parseRef(ref);
    if (!r) return null;
    const isQ = corpusOf(r.code) === 'quran';
    const first = isQ ? (trById[pref.quran].lang === 'en' ? pref.quran : 'PICK') : (trById[pref.bible].lang === 'en' && has(pref.bible, r.code) ? pref.bible : 'WEB');
    for (const t of [first].concat(M.translations.filter(x => x.lang === 'en' && has(x.id, r.code)).map(x => x.id))) {
      if (!has(t, r.code)) continue;
      const ch = (await loadBook(t, r.code))[r.ch - 1] || [];
      const vs = r.v1 ? ch.slice(r.v1 - 1, r.v2) : ch.slice(0, 2);
      const txt = vs.join(' ').trim();
      if (txt) return cut(txt, r.v2 - r.v1 > 3 || !r.v1 ? 360 : 520);
    }
    return null;
  }
  function passageList(t, { guide = 'all', scope = new Set() } = {}) {
    const all = [];
    t.texts.forEach(g => g.refs.forEach(([ref, why]) => all.push({ ref, why, kind: refKind(ref) })));
    let shown = scope.size ? all.filter(p => scope.has(p.kind)) : all;
    if (shown.length < 2) shown = all;      // the books named are the subject, not a filter (e.g. "what is the Talmud")
    const order = KIND_ORDER[guide] || KIND_ORDER.all;
    const groups = order.map(k => [k, shown.filter(p => p.kind === k)]).filter(g => g[1].length);
    return { groups, hidden: all.length - shown.length, total: all.length };
  }
  const passageHtml = p => '<a class="passage k-' + p.kind + '" href="' + refLink(p.ref) + '">' + copyBtn('.passage', 'Copy this passage') + '<span class="ref">' + esc(refLabel(p.ref)) + '</span>' +
    (p.why ? '<span class="why">' + esc(p.why) + '</span>' : '') +
    (linkParts(p.ref) || /^Mishnah /.test(p.ref) || talmudOne.test(p.ref) ? '' : '<div class="q" data-quote-ref="' + esc(p.ref) + '"><span class="shimmer"></span><span class="shimmer short"></span></div>') + '</a>';
  const groupsHtml = groups => groups.map(([k, ps]) => '<div class="pgroup">' + esc(KIND[k]) + ' <span class="badge">' + ps.length + '</span></div>' + ps.map(passageHtml).join('')).join('');
  async function fillQuotes(root) {
    await Promise.all([...root.querySelectorAll('[data-quote-ref]')].map(async el => {
      const text = await quoteText(el.dataset.quoteRef).catch(() => null);
      if (text) { el.textContent = text; el.removeAttribute('data-quote-ref'); } else el.remove();
    }));
  }
  const relatedLabel = path => {
    const [kind, slug] = path.split('/');
    if (kind === 'q') { const q = C.questions.find(x => x.slug === slug); return q && q.title; }
    if (kind === 'compare') { const c = B.compare.find(x => x.slug === slug); return c && 'Compare: ' + c.title; }
    if (kind === 'beliefs') { const t = B.traditions.find(x => x.slug === slug); return t && t.name; }
    if (kind === 'topic') { const t = C.topics.find(x => x.slug === slug); return t && t.title; }
    return null;
  };
  const relatedHtml = t => {
    const items = (t.related || []).map(p => [p, relatedLabel(p)]).filter(x => x[1]);
    return items.length ? '<div class="chips">' + items.map(([p, l]) => '<a class="chip" href="#/' + p + '">' + esc(l) + ' →</a>').join('') + '</div>' : '';
  };
  const viewsHtml = (t, order) => '<div class="views' + (order.length === 3 ? ' three' : '') + '">' + order.filter(f => t.views[f]).map(f =>
    '<div class="view ' + f + '"><div class="who"><span class="glyph-s">' + GLYPH[f] + '</span> ' + FAITH_ADJ[f] + ' view</div><p>' + rich(t.views[f]) + '</p></div>').join('') + '</div>';

  // #/t/<id>: one topic, every faith, every passage.
  async function tguide(id) {
    const t = G.topics.find(x => x.id === id);
    if (!t) return notFound();
    document.title = t.title + ' · Contradiction';
    const { groups } = passageList(t);
    app.innerHTML = '<p class="crumbs"><a href="#/topics">Topics</a></p><h1>' + esc(t.title) + '</h1>' +
      '<div class="summary-card">' + rich(t.summary) + '</div>' +
      '<div class="section-head"><h2>What each faith says</h2></div>' + viewsHtml(t, ['christian', 'muslim', 'jewish']) +
      '<div class="section-head"><h2>Where it is in the texts</h2></div>' + groupsHtml(groups) +
      (t.related && t.related.length ? '<div class="section-head"><h2>Go deeper</h2></div>' + relatedHtml(t) : '') +
      '<p><a class="btn brand" href="#/ask/' + encodeURIComponent('Tell me about ' + t.title.replace(/\?$/, '')) + '">Ask about this →</a></p>' +
      '<p class="status">Draft summary. Not yet reviewed by a priest, imam, rabbi or scholar.</p>';
    fillQuotes(app);
  }

  // Reading a question: which topic, who is asking, and which books they want.
  const qnorm = q => ' ' + norm(q).replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  const QSTEM = { jews: 'jew', jewish: 'jew', judaism: 'jew', muslims: 'muslim', islam: 'muslim', islamic: 'muslim', christians: 'christian', christianity: 'christian' };
  const QSTOPW = new Set('of the a an in on about do does did is are was were what how why who whom to for and or it this that think thinks say says believe believes view'.split(' '));
  const bag = s => new Set(s.trim().split(' ').filter(w => w && !QSTOPW.has(w)).map(w => QSTEM[w] || (w.length > 3 ? w.replace(/s$/, '') : w)));
  // Exact phrases score most; failing that, an alias whose words all appear somewhere in the question.
  function matchTopics(n) {
    const qb = bag(n);
    return G.topics.map(t => {
      let s = 0;
      for (const a of t.q) {
        if (n.includes(' ' + a + ' ') || n.includes(' ' + a + 's ')) { s += a.split(' ').length * 3 + a.length / 20; continue; }
        const ab = bag(a);
        if (ab.size >= 2 && [...ab].every(w => qb.has(w))) s += ab.size * 2;
      }
      const title = ' ' + norm(t.title).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
      if (n.includes(title)) s += 4;
      return [t, s];
    }).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  }
  function askerOf(n) {
    const m = n.match(/ (?:i m|im|i am|iam|as a|as an|being a|me a|for a)(?: a| an)? (muslim|christian|jew|jewish|catholic|orthodox|protestant|sunni|shia|shiite|atheist|agnostic|hindu|buddhist|sikh|evangelical|baptist) /);
    if (!m) return null;
    const w = m[1];
    return /muslim|sunni|shia|shiite/.test(w) ? 'muslim' : /christian|catholic|orthodox|protestant|evangelical|baptist/.test(w) ? 'christian' : /jew/.test(w) ? 'jewish' : 'other';
  }
  function scopeOf(n) {
    const s = new Set();
    if (/ (old testament|hebrew bible|tanakh|tanach|torah|ot) /.test(n) || (/ testaments? /.test(n) && / old /.test(n))) s.add('ot');
    if (/ (new testament|gospel|gospels|nt|epistles) /.test(n) || (/ testaments? /.test(n) && / new /.test(n))) s.add('nt');
    if (/ bible /.test(n) && !s.size) { s.add('ot'); s.add('nt'); s.add('dc'); }
    if (/ (quran|koran|qur an) /.test(n)) s.add('quran');
    if (/ (hadith|hadiths|sunnah|bukhari) /.test(n)) s.add('hadith');
    if (/ (talmud|mishnah|rabbis|rabbinic) /.test(n)) s.add('jewish');
    return s;
  }

  /* ---------- chat ---------- */
  const CHAT_ENDPOINT = 'api/chat';      // served by api/chat.js where the site runs on a host with server functions and an API key
  const GUIDES = [['all', 'All'], ['christian', 'Christian'], ['muslim', 'Muslim'], ['jewish', 'Jewish']];
  let guide = store.get('guide') || 'all', chatLog = [], lastTopic = null, aiReady = null, aiUrl = null;
  // The AI guide runs where content/config.json's aiEndpoint points, or at api/chat on hosts that run server functions.
  let aiProbe = null;
  const probeAI = () => aiProbe || (aiProbe = probeOnce());
  const probeOnce = () => {
    if (aiReady !== null) return Promise.resolve(aiReady);
    aiUrl = (SITE_CFG.aiEndpoint || '').trim() || (/github\.io$/.test(location.hostname) ? '' : CHAT_ENDPOINT);
    if (!aiUrl) return Promise.resolve(aiReady = false);
    return fetch(aiUrl, { method: 'GET' }).then(r => r.ok ? r.json() : null).then(j => (aiReady = !!(j && j.ok))).catch(() => (aiReady = false));
  };
  const avatar = g => '<span class="avatar ' + g + '">' + (GLYPH[g] || '') + '</span>';
  const guideName = g => g === 'all' ? 'all three faiths' : 'the ' + FAITH_ADJ[g] + ' guide';

  function emptyChat() {
    const intro = guide === 'all' ? 'Ask about any belief, story or practice. I\'ll show what Christians, Muslims and Jews each say, and where it is in their texts.'
      : 'I answer from the ' + FAITH_ADJ[guide] + ' point of view, with the passages ' + FAITH_PEOPLE[guide] + ' rely on, and I show how the others respond.';
    return '<div class="empty-chat">' + avatar(guide) + (aiReady ? '<p class="eyebrow">AI guide</p>' : '') + '<h1>' + (guide === 'all' ? 'What would you like to know?' : 'Ask the ' + FAITH_ADJ[guide] + ' guide') + '</h1><p class="muted">' + intro + '</p>' +
      '<div class="starter">' + SUGGEST.slice(0, 6).map(s => '<button data-ask="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div></div>';
  }
  function renderChat() {
    // Once the AI check finishes, refresh the welcome screen, but only if no question has been asked yet.
    if (aiReady === null) probeAI().then(ok => { const m = document.getElementById('msgs'); if (ok && m && !m.querySelector('.msg')) m.innerHTML = emptyChat(); });
    app.innerHTML = '<div class="chat"><div class="chat-head"><div class="seg even" role="group" aria-label="Who answers">' +
      GUIDES.map(([g, l]) => '<button data-guide="' + g + '" aria-pressed="' + (g === guide) + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="msgs" id="msgs">' + (chatLog.length ? chatLog.map(m => m.html).join('') : emptyChat()) + '</div>' +
      '<div class="composer">' + askBox(guide === 'all' ? 'Ask a question…' : 'Ask the ' + FAITH_ADJ[guide] + ' guide…') + '</div></div>';
    bindAsk(q => send(q));
    const msgs = document.getElementById('msgs');
    msgs.addEventListener('click', e => {
      const b = e.target.closest('[data-ask]');
      if (b) { e.preventDefault(); send(b.dataset.ask); }
    });
    app.querySelectorAll('[data-guide]').forEach(b => b.addEventListener('click', () => {
      guide = b.dataset.guide; store.set('guide', guide);
      const last = chatLog.length && chatLog.pop().q;      // the new guide answers it instead
      renderChat();
      if (last) send(last);       // answer the last question again in the new voice
    }));
  }
  function send(q) {
    history.replaceState(null, '', '#/ask/' + encodeURIComponent(q));
    answer(q);
  }
  async function ask(q) {
    document.title = 'Ask · Contradiction';
    renderChat();
    const last = chatLog.length && chatLog[chatLog.length - 1];
    if (q && !(last && last.q === q && last.guide === guide)) await answer(q);
    else { const m = document.getElementById('msgs'); if (chatLog.length) m.lastElementChild.scrollIntoView({ block: 'start' }); else app.querySelector('textarea').focus(); }
  }
  async function answer(q) {
    const msgs = document.getElementById('msgs'), rid = renderId;
    if (!chatLog.length) msgs.innerHTML = '';
    const user = '<div class="msg user"><div class="bubble">' + esc(q) + '</div></div>';
    msgs.insertAdjacentHTML('beforeend', user + '<div class="msg bot">' + avatar(guide) + '<div class="card"><span class="typing"><i></i><i></i><i></i></span></div></div>');
    const bot = msgs.lastElementChild, card = bot.querySelector('.card');
    bot.previousElementSibling.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const html = await buildAnswer(q, guide).catch(e => '<p>Something went wrong while looking that up: ' + esc(e.message) + '</p>');
    if (rid !== renderId) return;
    let a = '';
    if (await probeAI()) {
      card.innerHTML = '<div class="ai-text"><span class="typing"><i></i><i></i><i></i></span></div><p class="ai-status"></p>' +
        '<details class="acc sources"><summary>Sources and passages</summary><div class="body">' + html + '</div></details>';
      await fillQuotes(card);
      a = await aiTurn(q, card).catch(() => '');
      if (!a) card.querySelector('.sources').open = true;
    } else {
      card.innerHTML = html;
      await fillQuotes(card);
    }
    chatLog.push({ q, a, guide, html: user + bot.outerHTML });
    if (chatLog.length > 30) chatLog.shift();
  }

  // Light formatting for the AI's answer: paragraphs, lists, **bold**, verse links, and [n] citations.
  function mdLite(text, cites) {
    const cite = h => h.replace(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g, (m, list) => '<sup class="cite">' + list.split(/\s*,\s*/).map(n => {
      const c = cites[+n];
      return c ? '<a href="' + esc(c.href || '#') + '" title="' + esc(c.source) + '">' + esc(n) + '</a>' : esc(n);
    }).join(',') + '</sup>');
    const fmt = x => cite(rich(x)).replace(/(^|[\s(“"])\*([^*\n<]{1,160})\*(?=[\s.,;:!?)”"]|$)/g, '$1<em>$2</em>');
    const isLi = l => /^\s*([-*•]|\d+\.)\s+/.test(l);
    return text.trim().split(/\n\s*\n/).map(block => {
      const h = /^#{1,4}\s+(.*)$/.exec(block);
      if (h) return '<h4>' + fmt(h[1]) + '</h4>';
      // a block can mix a lead-in line with bullets, and bullets can be indented one level
      let out = '', para = [], list = null;
      const endP = () => { if (para.length) { out += '<p>' + fmt(para.join(' ')) + '</p>'; para = []; } };
      const endL = () => { if (list) { out += '<' + list.tag + '>' + list.items.join('') + '</' + list.tag + '>'; list = null; } };
      for (const l of block.split('\n')) {
        if (isLi(l)) {
          endP();
          if (!list) list = { tag: /^\s*\d+\./.test(l) ? 'ol' : 'ul', items: [] };
          list.items.push('<li' + (/^\s{2,}/.test(l) ? ' class="sub"' : '') + '>' + fmt(l.replace(/^\s*([-*•]|\d+\.)\s+/, '')) + '</li>');
        } else if (list && /^\s{2,}\S/.test(l)) list.items[list.items.length - 1] = list.items[list.items.length - 1].replace(/<\/li>$/, ' ' + fmt(l.trim()) + '</li>');
        else { endL(); para.push(l); }
      }
      endP(); endL();
      return out;
    }).join('');
  }

  // One turn with the AI guide. The site's own passages go with the question; the guide can look up more as it writes.
  async function aiTurn(q, card, opts) {
    const out = card.querySelector('.ai-text'), status = card.querySelector('.ai-status');
    const context = [...card.querySelectorAll('.sources .passage')].map(el => ({
      source: (el.querySelector('.ref') || el).textContent.trim() + (el.querySelector('.why') ? ' (' + el.querySelector('.why').textContent.trim() + ')' : ''),
      text: ((el.querySelector('.q') || {}).textContent || '').trim().slice(0, 1600), href: el.getAttribute('href') })).filter(p => p.text).slice(0, 24);
    const cites = {};
    context.forEach((p, i) => { cites[i + 1] = p; });
    const history = (opts && opts.log || chatLog).filter(m => m.a).slice(-6).flatMap(m => [{ role: 'user', content: m.q.slice(0, 1500) }, { role: 'assistant', content: m.a.slice(0, 6000) }]);
    let text = '';
    try {
      const r = await fetch(aiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ messages: history.concat({ role: 'user', content: q.slice(0, 1500) }), guide, context }, opts && opts.extra)) });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e && e.error ? e.error : 'The AI guide is not available right now.'); }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = '';
      const handle = ev => {
        if (ev.t === 'text') { text += ev.d; out.innerHTML = mdLite(text, cites) || '<span class="typing"><i></i><i></i><i></i></span>'; status.textContent = ''; }
        else if (ev.t === 'status') status.textContent = ev.d + '…';
        else if (ev.t === 'cite') cites[ev.n] = ev;
        else if (ev.t === 'error') throw new Error(ev.d);
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handle(JSON.parse(line)); }
      }
      status.textContent = '';
      out.insertAdjacentHTML('beforeend', '<p class="ai-foot">AI guide · numbers link to the passages. Check important points against the sources.</p>');
      out.insertAdjacentHTML('afterbegin', '<span class="tools">' + copyBtn('.ai-text', 'Copy answer') + (opts ? '' : shareBtn(q, location.origin + location.pathname + '#/ask/' + encodeURIComponent(q), 'ai')) + '</span>');
      return text;
    } catch (e) {
      status.textContent = '';
      out.innerHTML = (text ? mdLite(text, cites) : '') + '<p class="note">' + esc(e.message) + ' Here is what the site\'s guide has on it.</p>';
      return text;
    }
  }

  async function buildAnswer(q, g) {
    const n = qnorm(q), asker = askerOf(n), scope = scopeOf(n);
    let found = matchTopics(n);
    // A short follow-up ("and in the Old Testament?") continues the topic of the last question.
    if (!found.length && lastTopic && n.trim().split(' ').length <= 12 && chatLog.length) found = [[lastTopic, 1]];
    if (!found.length) { lastTopic = null; return fallbackAnswer(q, n, g); }
    lastTopic = found[0][0];
    const t = found[0][0];
    let mode = g !== 'all' && !t.views[g] ? 'all' : g;
    const faiths = ['christian', 'muslim', 'jewish'].filter(f => t.views[f]);
    let intro = '';
    if (asker && FAITH_ADJ[asker]) {
      const others = faiths.filter(f => f !== asker).map(f => FAITH_PEOPLE[f]);
      intro = mode !== 'all' && mode !== asker
        ? 'You said you\'re ' + art(FAITH_ADJ[asker]) + ', so here is how ' + FAITH_PEOPLE[mode] + ' see it, the passages they rely on, and how ' + FAITH_PEOPLE[asker] + ' respond.'
        : mode === asker ? 'Here is the ' + FAITH_ADJ[asker] + ' position with its sources, and how others see it.'
        : others.length ? 'Since you\'re ' + art(FAITH_ADJ[asker]) + ', here is how ' + others.join(' and ') + ' understand it, the passages they use, and where your own tradition answers.' : '';
    } else if (asker === 'other') intro = 'Here is how each faith understands it, explained from the beginning, with the passages.';
    if (g !== 'all' && mode === 'all') intro = (intro ? intro + ' ' : '') + 'This topic is mainly about ' + faiths.map(f => FAITH_PEOPLE[f]).join(' and ') + ', so all views are shown.';
    const order = mode !== 'all' ? [mode].concat(faiths.filter(f => f !== mode))
      : asker && faiths.includes(asker) ? faiths.filter(f => f !== asker).concat(asker) : faiths;
    const { groups, hidden, total } = passageList(t, { guide: mode, scope });
    const scopeNote = scope.size && hidden ? '<p class="note">Showing ' + [...scope].filter(k => KIND[k] && k !== 'dc').map(k => KIND[k]).join(' and ') + ', as you asked (' + hidden + ' more passages from other books are on the topic page).</p>' : '';
    let body = '<h3>' + esc(t.title) + '</h3>' + (intro ? '<p class="note">' + esc(intro) + '</p>' : '');
    if (mode === 'all') body += '<p>' + rich(t.summary) + '</p>' + viewsHtml(t, order);
    else body += viewsHtml(t, [mode]) + '<details class="acc"><summary>How ' + order.slice(1).map(f => FAITH_PEOPLE[f]).join(' and ') + ' see it</summary><div class="body" style="padding-left:18px">' + viewsHtml(t, order.slice(1)) + '</div></details>';
    body += '<div class="pgroup" style="margin-top:20px;font-family:var(--display);font-size:1.1rem">Where it is in the texts</div>' + scopeNote +
      (groups.length ? groupsHtml(groups) : '<p class="muted">No passages from those books are listed for this topic. <a href="#/t/' + t.id + '">See all ' + total + ' passages</a>.</p>');
    body += '<div class="chips"><a class="chip" href="#/t/' + t.id + '">Open the full topic →</a>' + (t.related || []).map(p => [p, relatedLabel(p)]).filter(x => x[1]).slice(0, 3)
      .map(([p, l]) => '<a class="chip" href="#/' + p + '">' + esc(l) + '</a>').join('') + '</div>';
    if (found.length > 1) body += '<p class="small muted" style="margin-top:12px">Also related:</p><div class="more-topics">' +
      found.slice(1, 5).map(([x]) => '<button class="chip" data-ask="' + esc(x.title.replace(/\?$/, '')) + '">' + esc(x.title) + '</button>').join('') + '</div>';
    return body;
  }
  async function fallbackAnswer(q, n, g) {
    const words = n.trim().split(' ').filter(w => w.length > 2);
    const near = G.topics.map(t => [t, words.filter(w => (' ' + t.q.join(' ') + ' ' + norm(t.title) + ' ').includes(' ' + w)).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const r = await retrieve(q);
    let body = '<h3>From the texts</h3><p>' + (r && r.passages.length
      ? 'I don\'t have a guide entry on that yet, so here are passages from each tradition that use the words in your question. Some may be off the point.'
      : 'I couldn\'t find that in the texts. Try different words, or pick a topic below.') + '</p>';
    if (near.length) body += '<p class="small muted">Did you mean:</p><div class="more-topics">' + near.map(([t]) => '<button class="chip" data-ask="' + esc(t.title.replace(/\?$/, '')) + '">' + esc(t.title) + '</button>').join('') + '</div>';
    if (r && r.pages.length) body += '<div class="pgroup" style="margin-top:16px">Answered on this site</div>' + r.pages.map(p => '<a class="passage" href="#/q/' + p.slug + '"><span class="ref">' + esc(p.title) + '</span><span class="why">' + esc(p.short) + '</span></a>').join('');
    if (r && r.passages.length) {
      const HEAD = { bible: 'The Bible', quran: 'The Quran', christian: 'Christian sources', islam: 'Islamic sources', judaism: 'Jewish sources' };
      let last = '';
      body += r.passages.map(p => (HEAD[p.faith] !== last ? '<div class="pgroup">' + (last = HEAD[p.faith]) + '</div>' : '') +
        '<a class="passage" href="' + p.href + '"><span class="ref">' + esc(p.source) + '</span><div class="q">' + esc(p.text.slice(0, 420)) + (p.text.length > 420 ? '…' : '') + '</div></a>').join('');
    }
    return body;
  }


  /* ---------- explore: the tools built on the texts ---------- */
  const EXPLORE = [['#/stories', 'Same story, side by side', 'Adam, Noah, Abraham, Moses, Mary and Jesus in the Bible and the Quran, with the differences'],
    ['#/prophecies', 'Prophecy checker', 'Every claimed prophecy of Jesus and of Muhammad, tested on the text'],
    ['#/translations', 'Where translations differ', 'The disputed words, in the original, with every edition side by side'],
    ['#/timeline', 'Timeline of the books', 'When each book was written and the oldest copies we have'],
    ['#/trainer', 'Debate trainer', 'Argue a side against a strong AI opponent and get scored'],
    ['#/videos', 'Recent debates', 'The newest videos from Christian, Muslim and Jewish debaters'],
    ['#/shamoun', 'Sam Shamoun’s debates', 'His arguments, his debates and how each went'],
    ['#/debates', 'All debates', 'The arguments in every direction, with verdicts']];
  const exploreGrid = () => '<div class="extra-list">' + EXPLORE.map(([h, t, d]) => '<a href="' + h + '"><strong>' + t + '</strong><span>' + d + '</span></a>').join('') + '</div>';
  const refsHtml = list => { const t = (list || []).map(ref => ({ ref, why: '', kind: refKind(ref) })); return t.length ? groupsHtml([...new Set(t.map(x => x.kind))].map(k => [k, t.filter(x => x.kind === k)])) : ''; };
  const STATUS = { strong: 'Strong', partial: 'Partly works', weak: 'Not proven', fails: 'Fails on the texts' };

  /* same story, side by side */
  async function stories(id) {
    const rid = renderId, d = await getJSON('content/stories.json').catch(() => ({ stories: [] }));
    if (rid !== renderId) return;
    const x = id && d.stories.find(s => s.id === id);
    if (!x) {
      document.title = 'Same story, side by side · Contradiction';
      app.innerHTML = '<h1>Same story, side by side</h1><p class="lede">The stories the Bible and the Quran both tell. Read each telling next to the other and see exactly where they part.</p>' +
        (d.stories.length ? '<div class="deb-grid">' + d.stories.map(s => '<a class="dispute-tile" href="#/stories/' + s.id + '"><strong>' + esc(s.title) + '</strong><span>' + esc(s.summary) + '</span><span class="vs"><i class="dot christian"></i><i class="dot jewish"></i><span class="small muted">and</span><i class="dot muslim"></i><span class="small muted">' + s.differences.length + ' differences</span></span></a>').join('') + '</div>' : '<p class="muted">Being written. Check back shortly.</p>');
      return;
    }
    document.title = x.title + ' · Contradiction';
    const i = d.stories.indexOf(x);
    app.innerHTML = '<p class="crumbs"><a href="#/stories">Same story, side by side</a></p><h1>' + esc(x.title) + '</h1><p class="lede">' + rich(x.summary) + '</p>' +
      '<div class="two-col"><section class="sec v-christian">' + COPY + '<span class="tag">In the Bible</span><p>' + rich(x.bible.telling) + '</p>' + refsHtml(x.bible.refs) + '</section>' +
      '<section class="sec v-muslim">' + COPY + '<span class="tag">In the Quran</span><p>' + rich(x.quran.telling) + '</p>' + refsHtml(x.quran.refs) + '</section></div>' +
      (x.jewish && x.jewish.telling ? '<section class="sec v-jewish">' + COPY + '<span class="tag">Jewish tradition adds</span><p>' + rich(x.jewish.telling) + '</p>' + refsHtml(x.jewish.refs) + '</section>' : '') +
      '<div class="section-head"><h2>Where they differ</h2></div><div class="diff">' + x.differences.map(f => '<div class="diff-row"><div class="diff-point">' + esc(f.point) + '</div><div class="diff-b"><span class="tag">Bible</span>' + rich(f.bible) + '</div><div class="diff-q"><span class="tag">Quran</span>' + rich(f.quran) + '</div>' +
        (f.note ? '<div class="diff-note">' + rich(f.note) + '</div>' : '') + '</div>').join('') + '</div>' +
      (x.shared && x.shared.length ? '<div class="section-head"><h2>Where they agree</h2></div><ul>' + x.shared.map(t => '<li>' + rich(t) + '</li>').join('') + '</ul>' : '') +
      '<p><a class="btn brand" href="#/ask/' + encodeURIComponent('Compare the Bible and the Quran on ' + x.title + '. Which telling is earlier, and what explains the differences?') + '">Ask the AI about this →</a></p>' +
      '<div class="pager">' + (i > 0 ? '<a class="btn ghost" href="#/stories/' + d.stories[i - 1].id + '">← ' + esc(d.stories[i - 1].title) + '</a>' : '<span></span>') + (i < d.stories.length - 1 ? '<a class="btn ghost" href="#/stories/' + d.stories[i + 1].id + '">' + esc(d.stories[i + 1].title) + ' →</a>' : '') + '</div>' +
      '<p class="status">Draft. Summaries are the site’s; tap any passage to read the text itself.</p>';
    fillQuotes(app);
  }

  /* prophecy checker */
  let prophFilter = 'all';
  async function prophecies() {
    document.title = 'Prophecy checker · Contradiction';
    const rid = renderId, d = await getJSON('content/prophecies.json').catch(() => ({ prophecies: [] }));
    if (rid !== renderId) return;
    const WHO = { christian: 'Christians say it foretells Jesus', muslim: 'Muslims say it foretells Muhammad', jewish: 'Jews say it is still to come' };
    const list = d.prophecies.filter(x => prophFilter === 'all' || x.claimed_by === prophFilter);
    app.innerHTML = '<h1>Prophecy checker</h1><p class="lede">The passages each faith says were foretold. For each one: the claim, what the passage says in its own setting, how the others read it, and whether the text supports the claim.</p>' +
      '<div class="chips">' + [['all', 'All'], ['christian', 'About Jesus'], ['muslim', 'About Muhammad'], ['jewish', 'Jewish expectations']].map(([k, l]) => '<button class="chip" data-f="' + k + '" aria-pressed="' + (k === prophFilter) + '">' + l + '</button>').join('') + '</div>' +
      (list.length ? list.map(x => '<details class="acc"><summary>' + esc(x.title) + ' <span class="verdict v-' + x.status + '">' + (STATUS[x.status] || '') + '</span></summary><div class="acc-body">' +
        '<p class="small muted">' + (WHO[x.claimed_by] || '') + '</p><section class="sec v-' + x.claimed_by + '">' + COPY + '<span class="tag">The claim</span><p>' + rich(x.claim) + '</p></section>' + refsHtml((x.text || []).concat(x.fulfilment || [])) +
        '<section class="sec v-overview">' + COPY + '<span class="tag">What the text says</span><p>' + rich(x.what_the_text_says) + '</p></section>' +
        (x.other_readings || []).map(o => '<section class="sec v-' + ({ Jewish: 'jewish', Muslim: 'muslim', Christian: 'christian' }[o.who] || 'critics') + '"><span class="tag">' + esc(o.who) + ' reading</span><p>' + rich(o.reading) + '</p></section>').join('') +
        '<p class="favours"><strong>' + (STATUS[x.status] || '') + '.</strong> ' + rich(x.status_reason || '') + (x.makes_more_sense ? ' <strong>Makes more sense:</strong> ' + rich(x.makes_more_sense) : '') + '</p>' +
        '<p><a class="btn brand" href="#/ask/' + encodeURIComponent('Test this prophecy claim: ' + x.title) + '">Ask the AI to test this →</a></p></div></details>').join('') : '<p class="muted">Being written. Check back shortly.</p>') +
      '<p class="status">Draft. The rating judges whether the passage supports the claim, not the religion.</p>';
    app.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { prophFilter = b.dataset.f; prophecies(); }));
    app.querySelectorAll('details.acc').forEach(el => el.addEventListener('toggle', () => { if (el.open) fillQuotes(el); }, { once: true }));
  }

  /* where translations differ: the disputed word, then every edition on the site */
  async function translationsPage() {
    document.title = 'Where translations differ · Contradiction';
    const rid = renderId, d = await getJSON('content/translations.json').catch(() => ({ verses: [] }));
    if (rid !== renderId) return;
    app.innerHTML = '<h1>Where translations differ</h1><p class="lede">Verses where the argument turns on one word. See the original word, how each translation renders it, and every edition on the site side by side.</p>' +
      (d.verses.length ? d.verses.map((x, i) => '<details class="acc" data-i="' + i + '"><summary>' + esc(x.ref) + ' <span class="small muted">· ' + esc(x.issue) + '</span></summary><div class="acc-body">' +
        '<p class="bigword" dir="auto">' + esc(x.word) + '</p><p class="small muted" style="text-align:center;margin-top:0">' + esc(x.translit || '') + '</p>' +
        '<div class="readings">' + (x.readings || []).map(r => '<div><strong>“' + esc(r.rendering) + '”</strong><span>' + esc(r.who) + '</span></div>').join('') + '</div>' +
        '<section class="sec v-overview">' + COPY + '<span class="tag">What the word means</span><p>' + rich(x.what_the_word_means) + '</p></section>' +
        '<section class="sec v-critics"><span class="tag">Why it matters</span><p>' + rich(x.why_it_matters) + '</p></section>' +
        '<h3>Every edition on this site</h3><div class="editions" data-ref="' + esc(x.ref) + '"><p class="muted small">Loading…</p></div>' +
        '<p><a class="btn brand" href="#/ask/' + encodeURIComponent('What does ' + x.ref + ' really say? The word ' + (x.translit || x.word) + ' is disputed: ' + x.issue) + '">Ask the AI →</a></p></div></details>').join('') : '<p class="muted">Being written. Check back shortly.</p>');
    app.querySelectorAll('details.acc').forEach(el => el.addEventListener('toggle', async () => {
      const box = el.querySelector('.editions'), r = parseRef(box.dataset.ref.split(',')[0]);
      if (!el.open || !r) { box.innerHTML = ''; return; }
      let h = '';
      for (const t of M.translations) {
        if (!has(t.id, r.code)) continue;
        const ch = (await loadBook(t.id, r.code).catch(() => []))[r.ch - 1] || [], txt = ch.slice((r.v1 || 1) - 1, r.v2 || r.v1 || 1).join(' ').trim();
        if (txt) h += '<div class="ed"><span class="tag">' + esc(t.name.replace(/^Quran: /, '')) + '</span><p dir="auto">' + esc(txt.length > 700 ? txt.slice(0, 700) + '…' : txt) + '</p></div>';
      }
      const lang = WBW_LANG(r.code), w = lang && await loadWbw(r.code).catch(() => null), words = w && w[r.ch - 1] && w[r.ch - 1][(r.v1 || 1) - 1];
      box.innerHTML = (words && words.length ? '<div class="ed"><span class="tag">Word by word</span>' + wordsHtml(words, lang) + '</div>' : '') + h +
        '<p class="small"><a href="' + refHref(r) + '">Open ' + esc(box.dataset.ref) + ' in the reader →</a></p>';
    }, { once: true }));
  }

  /* timeline: when the books were written and the oldest copies */
  let tlFilter = 'all';
  async function timeline() {
    document.title = 'Timeline of the books · Contradiction';
    const rid = renderId, d = await getJSON('content/timeline.json').catch(() => ({ events: [] }));
    if (rid !== renderId) return;
    const KIND = { written: 'Written', manuscript: 'Oldest copies', event: 'Event', canon: 'Canon and councils' };
    const list = d.events.filter(e => tlFilter === 'all' || e.faith === tlFilter || e.kind === tlFilter).sort((a, b) => a.year - b.year);
    app.innerHTML = '<h1>Timeline of the books</h1><p class="lede">When each scripture was written, when the events it describes took place, and the oldest copies that survive. Dates are mainstream scholarly estimates; where tradition and historians differ, both are given.</p>' +
      '<div class="chips">' + [['all', 'All'], ['jewish', 'Jewish'], ['christian', 'Christian'], ['muslim', 'Muslim'], ['manuscript', 'Oldest copies only']].map(([k, l]) => '<button class="chip" data-f="' + k + '" aria-pressed="' + (k === tlFilter) + '">' + l + '</button>').join('') + '</div>' +
      (list.length ? '<div class="tl">' + list.map(e => '<div class="tl-row f-' + e.faith + '"><div class="tl-year">' + esc(e.year_label) + '</div><div class="tl-body"><span class="tag">' + (KIND[e.kind] || '') + '</span><strong>' + esc(e.title) + '</strong><p>' + rich(e.text) + '</p>' +
        (e.gap ? '<p class="small muted">' + esc(e.gap) + '</p>' : '') + (e.source ? '<a class="small" href="' + esc(e.source) + '" target="_blank" rel="noopener">Source ↗</a>' : '') + '</div></div>').join('') + '</div>' : '<p class="muted">Being written. Check back shortly.</p>');
    app.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { tlFilter = b.dataset.f; timeline(); }));
  }

  /* ---------- debate trainer: argue one side; the AI plays a strong opponent, then coaches ---------- */
  let train = { you: store.get('train-you') || 'christian', opponent: store.get('train-opp') || 'muslim', log: [] };
  async function trainer() {
    document.title = 'Debate trainer · Contradiction';
    const rid = renderId, on = await probeAI();
    if (rid !== renderId) return;
    const sides = [['christian', 'Christian'], ['muslim', 'Muslim'], ['jewish', 'Jewish']];
    const seg = (key, val) => '<div class="seg even">' + sides.map(([k, l]) => '<button data-' + key + '="' + k + '" aria-pressed="' + (k === val) + '"' + (key === 'opp' && k === train.you ? ' disabled' : '') + '>' + l + '</button>').join('') + '</div>';
    app.innerHTML = '<div class="chat"><div class="chat-head trainer-head"><p class="crumbs"><a href="#/debates">Debates</a></p><h1 style="margin:.2em 0">Debate trainer</h1>' +
      '<p class="small muted" style="margin:0 0 6px">You argue as</p>' + seg('you', train.you) + '<p class="small muted" style="margin:10px 0 6px">Against a strong opponent who is</p>' + seg('opp', train.opponent) + '</div>' +
      '<div class="msgs" id="msgs">' + (train.log.length ? train.log.map(m => m.html).join('') :
        '<div class="welcome"><p class="lede">' + (on ? 'Practise your arguments. The AI answers like a well-prepared ' + FAITH_NAME[train.opponent] + ' debater, then steps out of role and scores what you said out of 10, against the actual texts.' : 'The debate trainer needs the AI guide, which is not available right now.') + '</p>' +
        (on ? '<p><button class="btn brand" data-start>Let the opponent open →</button></p><p class="small muted">Or type your own opening argument below.</p>' : '') + '</div>') + '</div>' +
      (on ? '<div class="composer">' + askBox('Make your argument…') + '</div>' : '') + '</div>';
    const turn = async q => {
      const msgs = document.getElementById('msgs');
      if (!train.log.length) msgs.innerHTML = '';
      msgs.insertAdjacentHTML('beforeend', (q === 'START' ? '' : '<div class="msg user"><div class="bubble">' + esc(q) + '</div></div>') + '<div class="msg bot">' + avatar(train.opponent) +
        '<div class="card"><div class="ai-text"><span class="typing"><i></i><i></i><i></i></span></div><p class="ai-status"></p></div></div>');
      const bot = msgs.lastElementChild;
      (bot.previousElementSibling || bot).scrollIntoView({ behavior: 'smooth', block: 'start' });
      const a = await aiTurn(q, bot.querySelector('.card'), { log: train.log, extra: { trainer: { you: train.you, opponent: train.opponent }, guide: 'all' } }).catch(() => '');
      train.log.push({ q, a, html: (q === 'START' ? '' : '<div class="msg user"><div class="bubble">' + esc(q) + '</div></div>') + bot.outerHTML });
    };
    if (on) bindAsk(turn);
    const st = app.querySelector('[data-start]'); if (st) st.addEventListener('click', () => turn('START'));
    app.querySelectorAll('[data-you], [data-opp]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.you) { train.you = b.dataset.you; if (train.opponent === train.you) train.opponent = sides.find(([k]) => k !== train.you)[0]; } else train.opponent = b.dataset.opp;
      store.set('train-you', train.you); store.set('train-opp', train.opponent); train.log = []; trainer();
    }));
  }

  /* ---------- copy buttons: copy the text of an answer, passage or section, with its links written out ---------- */
  const ICO_COPY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
  const ICO_OK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const ICO_SHARE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
  const copyBtn = (sel, label) => '<button class="copy-btn" data-copy="' + sel + '" type="button" aria-label="' + label + '" title="' + label + '">' + ICO_COPY + '</button>';
  const shareBtn = (title, url, kind) => '<button class="copy-btn share-btn" data-share="' + esc(url) + '" data-title="' + esc(title) + '" data-kind="' + (kind || '') + '" type="button" aria-label="Share" title="Share">' + ICO_SHARE + '</button>';
  const COPY = copyBtn('.sec', 'Copy this section');
  const plainText = el => {
    const c = el.cloneNode(true);
    c.querySelectorAll('.copy-btn, .tools, .ai-foot, script').forEach(x => x.remove());
    c.querySelectorAll('a[href]').forEach(a => { const h = a.getAttribute('href'); if (h && !/^javascript/.test(h) && !a.querySelector('.ref')) a.append(' (' + new URL(h, location.href).href + ')'); });
    c.querySelectorAll('li').forEach(li => li.prepend('• '));
    c.querySelectorAll('p, li, h2, h3, blockquote, .ref, .why').forEach(x => x.append('\n'));
    const tmp = document.createElement('div'); tmp.style.cssText = 'position:fixed;left:-9999px;white-space:pre-wrap'; tmp.append(c); document.body.append(tmp);
    const t = tmp.innerText.replace(/\n{3,}/g, '\n\n').trim(); tmp.remove(); return t;
  };
  const toClipboard = t => navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(t) : new Promise(res => {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); res(); });
  const flash = b => { const old = b.innerHTML; b.innerHTML = ICO_OK; b.classList.add('done'); setTimeout(() => { b.innerHTML = old; b.classList.remove('done'); }, 1500); };
  /* A picture of a verdict or answer to post: title, a few lines, the site's name. */
  function shareCard(title, lines) {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#faf8f4'; g.fillRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#2563eb'); grad.addColorStop(.5, '#0f9d6e'); grad.addColorStop(1, '#7c3aed');
    g.fillStyle = grad; g.fillRect(0, 0, W, 18);
    const wrap = (text, font, x, y, maxW, lh, maxLines) => { g.font = font; let line = '', n = 0;
      for (const w of text.split(/\s+/)) { const t = line ? line + ' ' + w : w;
        if (g.measureText(t).width > maxW && line) { n++; if (n >= maxLines) { g.fillText(line.replace(/.{3}$/, '…'), x, y); return y + lh; } g.fillText(line, x, y); y += lh; line = w; } else line = t; }
      if (line) { g.fillText(line, x, y); y += lh; } return y; };
    g.fillStyle = '#17171c'; g.textBaseline = 'top';
    let y = wrap(title, '700 64px Georgia, serif', 80, 110, W - 160, 78, 6) + 40;
    for (const [label, text] of lines) { if (!text) continue;
      g.fillStyle = '#2563eb'; g.font = '700 30px system-ui, sans-serif'; g.fillText(label.toUpperCase(), 80, y); y += 48;
      g.fillStyle = '#33333b'; y = wrap(text, '400 38px system-ui, sans-serif', 80, y, W - 160, 54, Math.max(2, Math.floor((H - 190 - y) / 54))) + 34;
      if (y > H - 220) break; }
    g.fillStyle = '#17171c'; g.font = '700 44px Georgia, serif'; g.fillText('Contradiction', 80, H - 130);
    g.fillStyle = '#6b6b76'; g.font = '400 30px system-ui, sans-serif'; g.fillText(location.host + location.pathname.replace(/\/$/, ''), 80, H - 74);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('.copy-btn');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.share) {
      const title = b.dataset.title, url = b.dataset.share;
      let lines = [];
      if (b.dataset.kind === 'ai') { const t = plainText(b.closest('.ai-text')).replace(/\(https?:[^)]*\)/g, ''); const m = t.match(/Overall:?\s*([\s\S]*?)(?:\n[-•]?\s*Makes more sense|\n\n|$)/), k = t.match(/Makes more sense:?\s*([\s\S]*?)(?:\n\n|$)/);
        lines = [['Overall', m ? m[1].trim() : t.slice(0, 500)], ['Makes more sense', k ? k[1].trim() : '']]; }
      else lines = JSON.parse(b.dataset.lines || '[]');
      const blob = await shareCard(title, lines).catch(() => null), file = blob && new File([blob], 'contradiction.png', { type: 'image/png' });
      try {
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ title, text: title + '\n' + url, files: [file] });
        else if (navigator.share) await navigator.share({ title, text: title, url });
        else { await toClipboard(title + '\n' + url); if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'contradiction.png'; a.click(); } flash(b); }
      } catch (err) { /* the reader closed the share sheet */ }
      return;
    }
    const box = b.dataset.copy === '.ai-text' ? b.closest('.ai-text') || b.closest('.msg') : b.closest(b.dataset.copy) || b.parentElement;
    let t = plainText(box);
    if (box.matches('.passage')) t += '\n' + new URL(box.getAttribute('href'), location.href).href;
    toClipboard(t).then(() => flash(b));
  }, true);

  /* ---------- debates: the published arguments, both ways, tested on the texts ---------- */
  const DIR = { 'christian-vs-islam': ['Christian case against Islam', 'christian', 'muslim'], 'islam-vs-christianity': ['Muslim case against Christianity', 'muslim', 'christian'],
    'jewish-vs-christianity': ['Jewish case against Christianity', 'jewish', 'christian'], 'jewish-vs-islam': ['Jewish case against Islam', 'jewish', 'muslim'],
    'christian-vs-judaism': ['Christian case against Judaism', 'christian', 'jewish'], 'islam-vs-judaism': ['Muslim case against Judaism', 'muslim', 'jewish'] };
  const VERDICT = { strong: 'Strong', partial: 'Partly works', weak: 'Not proven', fails: 'Fails on the texts' };
  let deb = null, debFilter = 'all';
  const mixDirs = list => { const by = {}; list.forEach(a => (by[a.direction] = by[a.direction] || []).push(a)); const q = Object.values(by), out = [];
    for (let i = 0; out.length < list.length; i++) q.forEach(g => g[i] && out.push(g[i])); return out; };
  const loadDebates = () => deb ? Promise.resolve(deb) : getJSON('content/debates.json').then(d => (deb = d)).catch(() => (deb = { arguments: [] }));
  const debTile = a => { const d = DIR[a.direction] || ['', '', ''];
    return '<a class="dispute-tile" href="#/d/' + a.id + '"><span class="eyebrow">' + esc(d[0]) + '</span><strong>' + esc(a.title) + '</strong><span>' + esc(a.argument) + '</span>' +
      '<span class="vs"><i class="dot ' + d[1] + '"></i><span class="small muted">vs</span><i class="dot ' + d[2] + '"></i>' + (a.verdict ? '<span class="verdict v-' + a.verdict + '">' + VERDICT[a.verdict] + '</span>' : '') + (a.favours && a.favours.side ? '<span class="small muted">· favours ' + esc(a.favours.side) + '</span>' : '') + '</span></a>'; };
  async function debates() {
    document.title = 'Debates · Contradiction';
    const id = renderId, d = await loadDebates();
    if (id !== renderId) return;
    const dirs = Object.keys(DIR).filter(k => d.arguments.some(a => a.direction === k));
    const list = d.arguments.filter(a => debFilter === 'all' || a.direction === debFilter);
    app.innerHTML = '<h1>Debates</h1><p class="lede">The arguments apologists actually make, in every direction. Each one shows the texts it relies on, the best reply from the other side, what the texts firmly establish, and a frank verdict on the argument.</p>' +
      '<a class="vid-banner" href="#/videos"><strong>▶ Recent debates on YouTube</strong><span>The newest videos from Christian, Muslim and Jewish debaters, with the AI’s take</span></a>' +
      '<a class="vid-banner" href="#/shamoun"><strong>Sam Shamoun’s debates</strong><span>His main arguments, every documented debate with Muslims, and how each one went</span></a>' +
      '<div class="chips">' + [['all', 'All']].concat(dirs.map(k => [k, DIR[k][0]])).map(([k, l]) => '<button class="chip" data-f="' + k + '" aria-pressed="' + (k === debFilter) + '">' + esc(l) + '</button>').join('') + '</div>' +
      (list.length ? '<div class="deb-grid">' + list.map(debTile).join('') + '</div>' : '<p class="muted">The debates are being researched and will appear here.</p>') +
      '<p class="status">Verdicts judge the argument, not the religion: whether its premises are really in the sources it cites, and whether the conclusion follows. They are drafts and have not been reviewed by scholars.</p>';
    app.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { debFilter = b.dataset.f; debates(); }));
  }
  async function debate(slug) {
    const rid = renderId, d = await loadDebates();
    if (rid !== renderId) return;
    const a = d.arguments.find(x => x.id === slug);
    if (!a) return notFound();
    document.title = a.title + ' · Contradiction';
    const dir = DIR[a.direction] || ['', '', ''];
    const people = (list, cls) => list && list.length ? '<p class="small muted">' + (cls === 'by' ? 'Made by ' : 'Answered by ') + esc(list.join(', ')) + '</p>' : '';
    const texts = (a.texts || []).map(t => typeof t === 'string' ? { ref: t, why: '' } : { ref: t.ref, why: t.note || '' }).map(t => Object.assign(t, { kind: refKind(t.ref) }));
    const other = a.other_texts || [];
    app.innerHTML = '<p class="crumbs"><a href="#/debates">Debates</a> › ' + esc(dir[0]) + '</p><h1>' + esc(a.title) + '</h1>' +
      (a.verdict ? '<p><span class="verdict big v-' + a.verdict + '">Verdict: ' + VERDICT[a.verdict] + '</span> ' + shareBtn(a.title, location.origin + location.pathname + '#/d/' + a.id).replace('data-kind=""', 'data-lines="' + esc(JSON.stringify([['Verdict', VERDICT[a.verdict]], ['Which side makes more sense', a.favours ? a.favours.text : ''], ['Assessment', a.assessment]])) + '"') + '</p>' : '') +
      (a.favours ? '<p class="favours">' + COPY.replace('.sec', '.favours') + (a.favours.side ? '<strong>Makes more sense: ' + esc(a.favours.side) + ' side.</strong> ' : /^Yes, there are/.test(a.favours.text) ? '' : '<strong>Evenly balanced.</strong> ') + rich(a.favours.text.replace(/^Evenly balanced: /, '')) + '</p>' : '') +
      '<section class="sec v-' + dir[1] + '">' + COPY + '<span class="tag">The argument</span>' + people(a.by, 'by') + '<p>' + rich(a.argument) + '</p></section>' +
      (texts.length ? '<div class="section-head"><h2>The texts</h2></div>' + groupsHtml([...new Set(texts.map(t => t.kind))].map(k => [k, texts.filter(t => t.kind === k)])) +
        '<p class="small muted">Tap a passage to read it in context, with the original Arabic, Hebrew or Greek word by word.</p>' : '') +
      (other.length ? '<div class="section-head"><h2>Other sources it cites</h2></div><ul class="other-src">' + other.map(o => '<li><strong>' + esc(o.ref) + '</strong>' + (o.note ? ' <span class="muted">' + esc(o.note) + '</span>' : '') +
        ' <span class="chk ' + (o.checked ? 'ok' : 'no') + '">' + (o.checked ? 'checked' : 'not checked yet') + '</span></li>').join('') + '</ul>' : '') +
      '<section class="sec v-' + dir[2] + '">' + COPY + '<span class="tag">The best reply</span>' + people(a.response_by, 'resp') + '<p>' + rich(a.response) + '</p></section>' +
      '<section class="sec v-overview">' + COPY + '<span class="tag">What the texts establish</span><p>' + rich(a.facts) + '</p></section>' +
      '<section class="sec v-critics">' + COPY + '<span class="tag">Assessment</span><p>' + rich(a.assessment) + '</p></section>' +
      (a.sources && a.sources.length ? '<details class="plain"><summary>Sources consulted (' + a.sources.length + ')</summary><ul class="small">' + a.sources.map(u => '<li><a href="' + esc(u) + '" rel="noopener" target="_blank">' + esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 90)) + '</a></li>').join('') + '</ul></details>' : '') +
      '<p><a class="btn brand" href="#/ask/' + encodeURIComponent(a.title) + '">Ask the AI to test this →</a></p>' +
      '<p class="status">Draft. The verdict judges this argument only. Not yet reviewed by scholars.</p>';
    fillQuotes(app);
  }

  /* ---------- recent debate videos: live from the AI server (?videos), else the saved snapshot content/videos.json ---------- */
  let vids = null, vidFilter = 'all';
  const FAITH_NAME = { christian: 'Christian', muslim: 'Muslim', jewish: 'Jewish', neutral: 'Debate hosts' };
  const vidAsk = v => 'A ' + (v.faith === 'neutral' ? '' : FAITH_NAME[v.faith] + ' ') + 'YouTube channel, ' + v.channel + ', posted a video titled "' + v.title + '"' +
    (v.desc ? '. Its description: "' + v.desc.slice(0, 300) + '"' : '') + '. You have not watched it; judging from the title and description, what claims is it making, and how do they hold up against the actual texts? Give your verdict.';
  const loadVids = async () => {
    const ep = (SITE_CFG.aiEndpoint || '').trim();
    if (ep) try { const r = await fetch(ep + (ep.includes('?') ? '&' : '?') + 'videos'); if (r.ok) { const j = await r.json(); if (j.videos && j.videos.length) return j; } } catch (e) {}
    return getJSON('content/videos.json').catch(() => ({ videos: [] }));
  };
  async function videos() {
    document.title = 'Recent debates · Contradiction';
    const rid = renderId;
    if (!vids) { app.innerHTML = '<h1>Recent debates</h1><p class="muted">Loading the newest videos…</p>'; vids = await loadVids(); }
    if (rid !== renderId) return;
    const list = vids.videos.filter(v => vidFilter === 'all' || v.faith === vidFilter);
    app.innerHTML = '<p class="crumbs"><a href="#/debates">Debates</a></p><h1>Recent debates</h1><p class="lede">The newest uploads from Christian, Muslim and Jewish debaters and apologists on YouTube. Tap one to watch it here, then ask the AI what it makes of the claims.</p>' +
      '<div class="chips">' + [['all', 'All']].concat(Object.entries(FAITH_NAME)).map(([k, l]) => '<button class="chip" data-f="' + k + '" aria-pressed="' + (k === vidFilter) + '">' + l + '</button>').join('') + '</div>' +
      '<div class="vid-grid">' + list.map(v => '<article class="vid" data-i="' + vids.videos.indexOf(v) + '"><button class="thumb" aria-label="Play ' + esc(v.title) + '"><img loading="lazy" src="https://i.ytimg.com/vi/' + encodeURIComponent(v.id) + '/mqdefault.jpg" alt=""><span class="play"></span></button>' +
        '<div class="vid-body"><span class="eyebrow">' + (v.faith === 'neutral' ? '' : '<i class="dot ' + v.faith + '"></i> ') + esc(v.channel) + '</span><strong>' + esc(v.title) + '</strong><span class="small muted">' + esc(v.date) + (v.views ? ' · ' + v.views.toLocaleString() + ' views' : '') + '</span>' +
        '<a class="btn" href="#/ask/' + encodeURIComponent(vidAsk(v)) + '">What does the AI think? →</a></div></article>').join('') + '</div>' +
      (list.length ? '' : '<p class="muted">No videos yet.</p>') +
      '<p class="status">Updated ' + esc(vids.updated || '') + '. Videos belong to their channels; listing them is not an endorsement. The AI judges the claims from the title and description, not by watching.</p>';
    app.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { vidFilter = b.dataset.f; videos(); }));
    app.querySelectorAll('.vid .thumb').forEach(b => b.addEventListener('click', () => {
      const v = vids.videos[b.closest('.vid').dataset.i];
      b.outerHTML = '<div class="thumb"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v.id) + '?autoplay=1" title="' + esc(v.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>';
    }));
  }

  /* ---------- Sam Shamoun: his recurring arguments and documented debates (content/shamoun.json) ---------- */
  async function shamoun() {
    document.title = 'Sam Shamoun · Contradiction';
    const rid = renderId, d = await getJSON('content/shamoun.json');
    if (rid !== renderId) return;
    const refs = list => { const t = (list || []).map(ref => ({ ref, why: '', kind: refKind(ref) })); return t.length ? groupsHtml([...new Set(t.map(x => x.kind))].map(k => [k, t.filter(x => x.kind === k)])) : ''; };
    const para = (label, txt) => txt ? '<p><strong>' + label + '</strong> ' + rich(txt) + '</p>' : '';
    app.innerHTML = '<p class="crumbs"><a href="#/debates">Debates</a></p><h1>Sam Shamoun</h1><p class="lede">' + rich(d.summary) + '</p>' +
      '<div class="section-head"><h2>His main arguments</h2></div>' +
      d.arguments.map(a => '<details class="acc"><summary>' + esc(a.title) + '</summary><div class="acc-body">' +
        '<section class="sec v-christian"><span class="tag">Shamoun’s argument</span><p>' + rich(a.argument) + '</p></section>' + refs(a.texts) +
        '<section class="sec v-muslim"><span class="tag">The Muslim answer</span><p>' + rich(a.response) + '</p></section>' +
        '<p><a class="btn brand" href="#/ask/' + encodeURIComponent('Test Sam Shamoun\'s argument: ' + a.title) + '">Ask the AI to test this →</a></p></div></details>').join('') +
      '<div class="section-head"><h2>His debates (' + d.debates.length + ')</h2></div><p class="small muted">Formal debates have no official winner and none of these held an audience vote. Under each one: what each side argued, and what supporters of both sides said afterwards.</p>' +
      '<div class="vid-grid">' + d.debates.map((x, i) => '<article class="vid" data-i="' + i + '">' +
        (x.video ? '<button class="thumb" aria-label="Play"><img loading="lazy" src="https://i.ytimg.com/vi/' + encodeURIComponent(x.video) + '/mqdefault.jpg" alt=""><span class="play"></span></button>' : '') +
        '<div class="vid-body"><span class="eyebrow">' + esc(x.date || 'Date unknown') + ' · vs ' + esc(x.opponent) + '</span><strong>' + esc(x.title || x.topics.join(', ')) + '</strong>' +
        '<span class="small muted">' + esc(x.where) + (x.confirmed ? '' : ' · <span class="chk no">not confirmed</span>') + '</span>' +
        '<details class="plain"><summary>What happened</summary>' + para('Shamoun:', x.shamoun) + para(x.opponent + ':', x.opponent_case) + para('Key moments:', x.exchanges) + para('How it was received:', x.reception) + refs(x.texts) +
        (x.url ? '<p class="small"><a href="' + esc(x.url) + '" target="_blank" rel="noopener">Open on YouTube ↗</a></p>' : '') + '</details></div></article>').join('') + '</div>' +
      '<div class="section-head"><h2>Style and controversies</h2></div><p>' + rich(d.style) + '</p>' +
      '<details class="plain"><summary>What could not be verified</summary><p class="small">' + rich(d.notes) + '</p></details>' +
      '<p class="status">Draft research from public videos, articles and both sides’ responses. Transcripts were not available, so points come from descriptions, reviews and written material.</p>';
    fillQuotes(app);
    app.querySelectorAll('.vid .thumb').forEach(b => b.addEventListener('click', () => {
      const x = d.debates[b.closest('.vid').dataset.i];
      b.outerHTML = '<div class="thumb"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(x.video) + '?autoplay=1" title="' + esc(x.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>';
    }));
  }

  /* ---------- the three faiths ---------- */
  function faiths() {
    document.title = 'Faiths · Contradiction';
    app.innerHTML = '<h1>The three faiths</h1><p class="lede">Each in its own words, then side by side. Every point links to the scripture or document it rests on.</p>' + faithCards() +
      '<div class="section-head"><h2>Compare them topic by topic</h2></div><div class="topic-grid">' +
      B.compare.map(c => '<a href="#/compare/' + c.slug + '">' + esc(c.title) + '</a>').join('') + '</div>';
  }
  function hub(slug, branch) {
    const h = HUBS[slug];
    if (!h) return notFound();
    if (!h.branches.some(b => b[0] === branch)) branch = h.branches[0][0];
    const t = B.traditions.find(x => x.slug === branch);
    document.title = (branch === h.branches[0][0] ? h.name : t.short) + ' · Contradiction';
    const tops = G.topics.filter(x => x.views[h.key]);
    app.innerHTML = '<section class="banner ' + h.key + '" data-glyph="' + h.glyph + '"><p class="crumbs"><a href="#/faiths">Faiths</a></p><h1>' + h.name + '</h1><p>' + esc(h.blurb) + '</p>' +
      '<a class="btn" href="#/ask" data-set-guide="' + h.key + '">' + h.glyph + ' Ask the ' + FAITH_ADJ[h.key] + ' guide</a></section>' +
      (h.branches.length > 1 ? '<div class="seg even">' + h.branches.map(b => '<a href="#/faith/' + slug + '/' + b[0] + '"' + (b[0] === branch ? ' class="on"' : '') + '>' + b[1] + '</a>').join('') + '</div>' : '<div style="height:10px"></div>') +
      '<p class="lede">' + esc(t.summary) + '</p>' +
      '<div class="section-head"><h2>' + (branch === 'christianity' || branch === 'islam' ? 'What they all believe' : 'What they believe') + '</h2></div>' +
      t.sections.map((s, i) => '<details class="acc ' + h.key + '"' + (i === 0 ? ' open' : '') + '><summary><span class="n">' + (i + 1) + '</span>' + esc(s.h) + '</summary><div class="body"><ul>' +
        s.points.map(p => '<li>' + rich(p) + '</li>').join('') + '</ul></div></details>').join('') +
      '<div class="section-head"><h2>Read their texts</h2></div><ul class="toc">' + t.texts.map(x => '<li><a href="#/' + encodeURI(x[0]) + '">' + esc(x[1]) + ' →</a></li>').join('') + '</ul>' +
      '<div class="section-head"><h2>Topics</h2><a href="#/topics">All topics</a></div><div class="chips">' + tops.slice(0, 18).map(x => '<a class="chip" href="#/t/' + x.id + '">' + esc(x.title) + '</a>').join('') + '</div>' +
      '<p class="status">Draft summary. Not yet reviewed by a priest, imam, rabbi or scholar.</p>';
    app.querySelector('[data-set-guide]').addEventListener('click', e => { guide = e.currentTarget.dataset.setGuide; store.set('guide', guide); });
  }
  function beliefs(slug) {
    if (!slug) return location.replace('#/faiths');
    const h = hubOf(slug);
    location.replace(h ? '#/faith/' + h + '/' + slug : '#/faiths');
  }
  const compareList = () => '<div class="topic-grid">' + B.compare.map(c => '<a href="#/compare/' + c.slug + '">' + esc(c.title) + '</a>').join('') + '</div>';
  function compareView(slug) {
    if (!slug) return location.replace('#/faiths');
    const i = B.compare.findIndex(x => x.slug === slug), c = B.compare[i];
    if (!c) return notFound();
    document.title = c.title + ' compared · Contradiction';
    const qs = (c.more || []).map(m => C.questions.find(q => 'q/' + q.slug === m)).filter(Boolean);
    app.innerHTML = '<p class="crumbs"><a href="#/faiths">Faiths</a> › Compare</p><h1>' + esc(c.title) + '</h1>' +
      '<div class="views">' + c.rows.map(r => { const f = VIEW_GROUP[r[0]] || r[0];
        return '<div class="view ' + f + '"><div class="who">' + (GLYPH[f] ? '<span>' + GLYPH[f] + '</span> ' : '') + esc(r[1]) + '</div><p>' + rich(r[2]) + '</p></div>'; }).join('') + '</div>' +
      (qs.length ? '<div class="section-head"><h2>The arguments in full</h2></div>' + questionCards(qs) : '') +
      '<div class="pager">' + (i > 0 ? '<a class="btn ghost" href="#/compare/' + B.compare[i - 1].slug + '">← ' + esc(B.compare[i - 1].title) + '</a>' : '<span></span>') +
      (i < B.compare.length - 1 ? '<a class="btn ghost" href="#/compare/' + B.compare[i + 1].slug + '">' + esc(B.compare[i + 1].title) + ' →</a>' : '') + '</div>';
  }

  /* ---------- edition picker ---------- */
  const sheet = document.getElementById('sheet');
  const pickerBtn = t => '<button class="picker" data-picker>' + esc(trById[t].name.replace(/^Quran: /, 'Quran · ')) + '</button>';
  function bindPicker() { const b = app.querySelector('[data-picker]'); if (b) b.addEventListener('click', openSheet); }
  function openSheet() {
    const sc = readScope(trById[tr].corpus), ok = t => sc.eds.includes(t.id), q = trById[tr].corpus === 'quran';
    const sets = q ? [['In English, by Muslim translators', t => ok(t) && t.lang === 'en' && !['RODW', 'PALM', 'SALE'].includes(t.id)], ['In Arabic', t => ok(t) && t.lang === 'ar'], ['By non-Muslim translators', t => ok(t) && ['RODW', 'PALM', 'SALE'].includes(t.id)]]
      : [[sc.name + (sc.jewish ? ' Bible in English' : ' Bible in English'), t => ok(t) && t.lang === 'en'], ['Original languages', t => ok(t) && t.lang !== 'en']];
    sheet.innerHTML = '<div class="panel" role="dialog" aria-label="Choose an edition"><div class="grab"></div><strong style="font:700 1.2rem var(--display)">Choose an edition</strong>' +
      sets.filter(([, f]) => M.translations.some(f)).map(([label, f]) => '<h3>' + label + '</h3>' + M.translations.filter(f).map(t => '<button class="opt" data-tr="' + t.id + '"' + (t.id === tr ? ' aria-current="true"' : '') +
        '><div>' + esc(t.name.replace(/^Quran: /, '')) + '<span>' + esc(t.tradition) + '</span></div></button>').join('')).join('') + '</div>';
    sheet.hidden = false;
    sheet.onclick = e => {
      const o = e.target.closest('[data-tr]');
      if (o) chooseEdition(o.dataset.tr);
      if (o || e.target === sheet) sheet.hidden = true;
    };
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') sheet.hidden = true; });
  function chooseEdition(id) {
    const m = location.hash.match(/^#\/(read|books)\/[A-Z]+(.*)$/);
    const same = trById[id].corpus === trById[tr].corpus;
    setTr(id);
    if (m && (same || m[1] === 'books')) location.hash = '#/' + m[1] + '/' + tr + m[2];
    else if (m) location.hash = '#/books/' + tr; else route();
  }

  /* #/go/<work>/<key>: find a hadith by number, a Talmud page, a chapter or a named section, then open it. */
  async function go(id, ...rest) {
    const key = rest.join('/'), k = key.toLowerCase(), rid = renderId;
    await loadLib();
    const w = L.find(x => x.id === id);
    if (!w) return notFound();
    const toc = await loadToc(id);
    let part = -1, idx;
    if (/^hadith-/.test(id)) {
      const nums = await getJSON('lib/' + id + '/nums.json').catch(() => ({}));
      if (nums[key]) [part, idx] = nums[key];
    }
    if (part < 0) {
      const ch = k.split(':')[0];
      part = toc.findIndex(p => { const t = p[0].toLowerCase(); return t === k || t === 'daf ' + k || t === 'chapter ' + ch || t.startsWith(k + '. '); });
      if (part < 0) part = toc.findIndex(p => (p[2] || '').toLowerCase().split(' | ').includes(k));     // an article of exactly that name
      if (part < 0) part = toc.findIndex(p => (p[0] + ' ' + (p[2] || '')).toLowerCase().includes(k));
      if (part >= 0) {      // inside the part, go to the passage with that number or the article with that name
        const items = (await loadPart(id, part)).items;
        const i = key.includes(':') ? items.findIndex(it => it.n === key) : items.findIndex(it => it.h && it.h.toLowerCase().startsWith(k));
        if (i >= 0) idx = i;
      }
    }
    if (rid !== renderId) return;
    location.replace('#/lib/' + id + (part >= 0 ? '/' + part + (idx !== undefined ? '/' + idx : '') : ''));
  }

  const notFound = () => { app.innerHTML = '<h1>Page not found</h1><p><a href="#/">Go to the home page</a></p>'; };

  /* ---------- routing ---------- */
  function setTr(t) { tr = t; pref[trById[t].corpus] = t; store.set('tr', t); store.set('tr-' + trById[t].corpus, t); }
  const TAB = { '': '', ask: 'ask', faiths: 'faiths', faith: 'faiths', beliefs: 'faiths', compare: 'faiths', books: 'books', read: 'books', lib: 'lib', go: 'lib',
    topics: 'topics', t: 'topics', topic: 'topics', q: 'topics', questions: 'topics', search: 'search', debates: 'debates', d: 'debates', videos: 'debates', shamoun: 'debates', trainer: 'debates', stories: 'topics', prophecies: 'topics', translations: 'topics', timeline: 'topics' };
  function route() {
    renderId++;
    const [name, ...a] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
    const tab = TAB[name] !== undefined ? TAB[name] : name;
    document.querySelectorAll('.links a, .tabbar a').forEach(l => l.classList.toggle('on', l.getAttribute('href') === '#/' + tab));
    sheet.hidden = true;
    app.className = 'enter' + (name === 'ask' || name === 'trainer' ? ' chatmode' : '');
    document.body.classList.toggle('chatting', name === 'ask' || name === 'trainer');
    window.scrollTo(0, 0);
    const views = { '': home, questions, q: question, topic, topics, t: tguide, books, read, search: () => search(a.join('/')), about, lib: () => library(a),
      beliefs, faiths, faith: hub, compare: compareView, go, ask: () => ask(a.join('/')), debates, d: debate, videos, shamoun, trainer, stories, prophecies, translations: translationsPage, timeline };
    Promise.resolve((views[name] || notFound)(...a)).catch(e => {
      app.innerHTML = '<h1>Something went wrong</h1><p class="muted">' + esc(e.message) + '</p>';
    });
  }

  Promise.all(['data/index.json', 'content/questions.json', 'content/disputes.json', 'content/beliefs.json', 'content/guide.json'].map(getJSON)
    .concat(getJSON('content/config.json').catch(() => ({})))).then(([m, c, d, b, g, cfg]) => {
    M = m; C = c; B = b; G = g; SITE_CFG = cfg || {};
    C.questions = C.questions.concat(d.questions);
    M.translations.forEach(t => { trById[t.id] = t; t.chapters = Object.fromEntries(t.books); });
    setupRefs();
    ['bible', 'quran'].forEach(c => { const v = store.get('tr-' + c); if (trById[v] && trById[v].corpus === c) pref[c] = v; });
    setTr(trById[store.get('tr')] ? store.get('tr') : 'WEB');
    window.addEventListener('hashchange', route);
    const top = document.querySelector('.top');
    window.addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 4), { passive: true });
    route();
  }).catch(e => { app.innerHTML = '<h1>Could not load the site</h1><p class="muted">' + esc(e.message) + '</p>'; });
})();
