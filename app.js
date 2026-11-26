/* Scripture Q&A: static, hash-routed.
   Scripture in data/<EDITION>/<BOOK>.json, other texts in lib/<work>/, word index in search/,
   answers in content/questions.json and disputes.json, belief summaries in content/beliefs.json. */
(() => {
  const app = document.getElementById('app');
  const trSel = document.getElementById('tr');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const GROUPS = { ot: 'Old Testament', dc: 'Deuterocanon & Apocrypha', nt: 'New Testament', quran: 'Quran' };
  const corpusOf = code => bookGroup[code] === 'quran' ? 'quran' : 'bible';
  const RTL = { he: 1, ar: 1 };
  const pref = { bible: 'WEB', quran: 'PICK' };
  const VIEW_GROUP = { orthodox: 'christian', catholic: 'christian', protestant: 'christian', sunni: 'muslim', shia: 'muslim' };
  let M, C, B, tr, refRe, refOne, viewFilter = 'all', lastQ, renderId = 0;
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
  function rich(s) {
    const held = [];
    const hold = h => '\u0001' + (held.push(h) - 1) + '\u0002';
    return esc(s)
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (m, path, label) => hold('<a href="#/' + encodeURI(path) + '">' + label + '</a>'))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(hadithRe, (m, book, n) => hold('<a class="ref" href="#/go/' + HADITH[book] + '/' + n + '">' + m + '</a>'))
      .replace(mishnahRe, (m, t, ref) => hold('<a class="ref" href="#/go/sef-mishnah-' + slugify(t) + '/' + ref + '">' + m + '</a>'))
      .replace(talmudRe, (m, t, daf) => hold('<a class="ref" href="#/go/sef-' + slugify(t) + '/' + daf + '">' + m + '</a>'))
      .replace(refRe, m => {
        const r = parseRef(m);
        return r && trFor(r.code) ? '<a class="ref" href="' + refHref(r) + '">' + m + '</a>' : m;
      })
      .replace(/\u0001(\d+)\u0002/g, (m, i) => held[i]);
  }

  /* ---------- views ---------- */
  const isDispute = q => q.kind === 'dispute';
  function home() {
    document.title = 'Scripture Q&A';
    const disputes = C.questions.filter(isDispute);
    app.innerHTML =
      '<h1>Ask the hard questions. Read the actual texts.</h1>' +
      '<p class="lede">The Bible, the Quran, the hadith, the Talmud and the Church Fathers in one place, with answers that quote the text and show how Christians, Muslims, Jews and critics each read it.</p>' +
      searchForm('').replace('<form ', '<form data-ask="1" ').replace(/placeholder="[^"]*"/, 'placeholder="Ask a question, or search a word or verse"') +
      '<h2>What each tradition believes</h2>' + beliefCards() +
      '<ul class="cards"><li><a href="#/compare"><strong>Compare them topic by topic</strong><span>God, Jesus, scripture, salvation, the law and more, side by side.</span></a></li></ul>' +
      '<h2>Where the faiths disagree</h2>' + questionCards(disputes.slice(0, 5)) +
      '<p><a href="#/questions">All ' + disputes.length + ' disputes and ' + (C.questions.length - disputes.length) + ' questions</a></p>' +
      '<h2>Questions</h2>' + questionCards(C.questions.filter(q => !isDispute(q))) +
      '<h2>Topics</h2><ul class="cards two">' + C.topics.map(t =>
        '<li><a href="#/topic/' + t.slug + '"><strong>' + esc(t.title) + '</strong><span>' + esc(t.blurb) + '</span></a></li>').join('') + '</ul>' +
      '<h2>Read the Bible</h2>' + trCards('bible') + '<h2>Read the Quran</h2>' + trCards('quran') +
      '<h2>Library</h2><ul class="cards"><li><a href="#/lib"><strong>Hadith, Talmud, commentaries, creeds and Church Fathers</strong><span>Sunni and Shia hadith, Quran commentaries, the Mishnah, both Talmuds and the Midrash, the creeds and confessions of the churches, the Fathers, Aquinas, Luther, Calvin and Wesley.</span></a></li></ul>';
    bindSearch();
  }
  const trCards = corpus => '<ul class="cards two">' + M.translations.filter(t => t.corpus === corpus).map(t =>
    '<li><a href="#/books/' + t.id + '"><strong>' + esc(t.name.replace(/^Quran: /, '')) + '</strong><span>' + esc(t.tradition) + ' · ' + esc(t.sub) + '</span></a></li>').join('') + '</ul>';
  const questionCards = qs => '<ul class="cards">' + qs.map(q =>
    '<li><a href="#/q/' + q.slug + '"><strong>' + esc(q.title) + '</strong><span>' + esc(q.short) + '</span></a></li>').join('') + '</ul>';
  const searchForm = q => '<form class="searchbox" role="search"><input type="search" name="q" value="' + esc(q) +
    '" placeholder="Search every text, e.g. forgiveness, or John 3:16" aria-label="Search"><button>Search</button></form>';
  function bindSearch() {
    const f = app.querySelector('form.searchbox');
    // A full question goes to Ask; a word, phrase or verse reference goes to Search.
    if (f) f.addEventListener('submit', e => {
      e.preventDefault();
      const q = f.q.value.trim(), asking = f.dataset.ask && (/\?$/.test(q) || q.split(/\s+/).length >= 4) && !/^".*"$/.test(q);
      location.hash = (asking ? '#/ask/' : '#/search/') + encodeURIComponent(q);
    });
  }

  function questions() {
    document.title = 'Questions · Scripture Q&A';
    app.innerHTML = '<h1>Questions and disputes</h1><p class="lede">Each page quotes the texts and sets the views of each faith side by side.</p>' +
      '<h2>Where the faiths disagree</h2>' + questionCards(C.questions.filter(isDispute)) +
      '<h2>Questions</h2>' + questionCards(C.questions.filter(q => !isDispute(q)));
  }

  function topic(slug) {
    const t = C.topics.find(x => x.slug === slug);
    if (!t) return notFound();
    document.title = t.title + ' · Scripture Q&A';
    const qs = t.questions.map(s => C.questions.find(q => q.slug === s)).filter(Boolean);
    app.innerHTML = '<p class="crumbs"><a href="#/">Home</a> › Topic</p><h1>' + esc(t.title) + '</h1><p class="lede">' + esc(t.blurb) + '</p>' +
      '<h2>Questions</h2>' + questionCards(qs) +
      (t.passages.length ? '<h2>Key passages</h2><ul class="booklist">' + t.passages.map(p => {
        const r = parseRef(p); return '<li><a href="' + refHref(r) + '">' + esc(p) + '</a></li>';
      }).join('') + '</ul>' : '');
  }

  function question(slug) {
    const q = C.questions.find(x => x.slug === slug);
    if (!q) return notFound();
    document.title = q.title + ' · Scripture Q&A';
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

  function books(t) {
    if (!trById[t]) t = tr;
    setTr(t);
    document.title = trById[t].name + ' · Scripture Q&A';
    let h = '<p class="crumbs"><a href="#/">Home</a> › Read</p><h1>' + esc(trById[t].name) + '</h1><p class="muted small">' + esc(trById[t].licence) + '</p>';
    for (const g in GROUPS) {
      const list = trById[t].books.filter(b => bookGroup[b[0]] === g);
      if (list.length) h += '<h2>' + GROUPS[g] + '</h2><ul class="booklist">' + list.map(b =>
        '<li><a href="#/read/' + t + '/' + b[0] + '">' + esc(bookName[b[0]]) + '</a></li>').join('') + '</ul>';
    }
    app.innerHTML = h;
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
    const crumbs = '<p class="crumbs"><a href="#/books/' + t + '">' + esc(trById[t].name) + '</a> › <a href="#/read/' + t + '/' + code + '">' + esc(bookName[code]) + '</a></p>';
    if (!ch && n > 1) {
      document.title = bookName[code] + ' · Scripture Q&A';
      app.innerHTML = crumbs + '<h1>' + esc(bookName[code]) + '</h1><ul class="chlist">' +
        Array.from({ length: n }, (_, i) => '<li><a href="#/read/' + t + '/' + code + '/' + (i + 1) + '">' + (i + 1) + '</a></li>').join('') + '</ul>';
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
      '<p class="muted small">Tap a verse to compare translations.</p><div class="chapter' + (RTL[lang] ? ' rtl' : '') + '" lang="' + lang + '"' + (RTL[lang] ? ' dir="rtl"' : '') + '>' +
      book[ch - 1].map((txt, i) => txt ? '<p data-v="' + (i + 1) + '"' + (i + 1 >= v1 && i + 1 <= v2 ? ' class="sel"' : '') +
        '><sup>' + (i + 1) + '</sup>' + esc(txt) + '</p>' : '').join('') + '</div>' +
      '<div class="pager">' + (ch > 1 ? '<a class="btn ghost" href="' + link(ch - 1) + '">← Chapter ' + (ch - 1) + '</a>' : '<span></span>') +
      (ch < n ? '<a class="btn ghost" href="' + link(ch + 1) + '">Chapter ' + (ch + 1) + ' →</a>' : '') + '</div>';
    const box = app.querySelector('.chapter');
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
    dl.innerHTML = '<strong class="small">' + esc(bookName[code]) + ' ' + (trById[t].chapters[code] > 1 ? ch + ':' : 'verse ') + v + ' in other editions</strong>' + rows.join('') +
      (corpusOf(code) === 'bible' ? '<p class="muted small">Chapter and verse numbers sometimes differ between traditions, most of all in the Psalms.</p>' : '');
  }

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
    document.title = (q ? q + ' · ' : '') + 'Search · Scripture Q&A';
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
    document.title = 'About · Scripture Q&A';
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
    document.title = 'Library · Scripture Q&A';
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
    document.title = w.t + ' · Scripture Q&A';
    app.innerHTML = libCrumbs(w) + '<h1>' + esc(w.t) + '</h1>' + (w.a ? '<p class="lede">' + esc(w.a) + '</p>' : '') + libSearchForm(w, '') +
      '<ul class="toc">' + toc.map((p, i) => '<li><a href="#/lib/' + w.id + '/' + i + '">' + esc(p[0]) + '</a> <span class="muted small">' + p[1] + '</span></li>').join('') + '</ul>' +
      '<p class="status">' + esc(w.l) + '</p>';
    bindLibSearch(w);
  }

  const itemHtml = (it, i, w, sel) => (it.h ? '<h3>' + esc(it.h) + '</h3>' : '') +
    '<div class="item' + (sel ? ' sel' : '') + '" id="i' + i + '">' + (it.n ? '<span class="num">' + esc(it.n) + '</span>' : '') +
    (it.e ? '<p>' + rich(it.e) + '</p>' : '') +
    (it.o ? '<p class="orig" dir="auto" lang="' + (w.lang || '') + '">' + esc(it.o).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</p>' : '') +
    (it.g ? '<p class="muted small" dir="auto">' + esc(it.g) + '</p>' : '') + '</div>';

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



  /* ---------- ask: find the passages that bear on a question, then (optionally) have an AI write the answer ---------- */
  const CHAT_ENDPOINT = 'api/chat';      // served by api/chat.js when the site is deployed with an API key
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
  const askForm = q => '<form class="searchbox" role="search"><input type="search" name="q" value="' + esc(q) + '" placeholder="e.g. What happens after death?" aria-label="Your question"><button>Ask</button></form>';

  async function ask(q) {
    document.title = (q ? q + ' · ' : '') + 'Ask · Scripture Q&A';
    const id = renderId;
    app.innerHTML = '<h1>Ask a question</h1>' + askForm(q) + '<div id="res"></div>';
    app.querySelector('form').addEventListener('submit', e => { e.preventDefault(); location.hash = '#/ask/' + encodeURIComponent(e.target.q.value.trim()); });
    const res = document.getElementById('res');
    if (!q) {
      res.innerHTML = '<p class="muted">Ask in your own words. The site finds the passages in every tradition\'s texts that bear on the question and shows them side by side.</p>' +
        '<ul class="booklist">' + ['What happens after death?', 'Can sins be forgiven?', 'How should the poor be treated?', 'What is said about Mary?', 'Is fasting required?', 'Who is the Messiah?'].map(x =>
          '<li><a href="#/ask/' + encodeURIComponent(x) + '">' + x + '</a></li>').join('') + '</ul>';
      app.querySelector('input').focus();
      return;
    }
    res.innerHTML = '<p class="loading">Looking through the texts…</p>';
    await Promise.all([loadSM(), loadLib()]);
    const words = [...new Set((norm(q).match(/[a-z]{2,24}|\d{3,4}/g) || []).filter(w => !SM.stopSet.has(w) && !QSTOP.has(w)))];
    const pages = C.questions.map(x => [x, words.filter(w => norm(x.title + ' ' + x.short + ' ' + x.asked).includes(w)).length])
      .filter(x => words.length && x[1] >= Math.max(1, Math.ceil(words.length / 2))).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
    if (!words.length) { res.innerHTML = '<p>Try a question with a more specific word in it.</p>'; return; }
    // Score every section. A question word counts once (variants included) and weighs more the rarer it is;
    // it counts triple when it is in the section's title or headings; long sections are marked down.
    const groups = await Promise.all(words.map(async w => {
      const vs = variants(w), lists = await Promise.all(vs.map(postings)), heads = await Promise.all(vs.map(v => postings('T' + v)));
      return { vs, lists, heads, df: Math.max(1, ...lists.map(l => l.length)) };
    }));
    if (id !== renderId) return;
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
    if (id !== renderId) return;
    const order = ['bible', 'quran', 'christian', 'islam', 'judaism'];
    passages.sort((a, b) => order.indexOf(a.faith) - order.indexOf(b.faith));
    const HEAD = { bible: 'The Bible', quran: 'The Quran', christian: 'Christian sources', islam: 'Islamic sources', judaism: 'Jewish sources' };
    const hl = new RegExp('\\b(' + groups.flatMap(g => g.vs).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
    let last = '';
    res.innerHTML = (pages.length ? '<h2>Answered on this site</h2>' + questionCards(pages) : '') +
      (passages.length ? '<section class="sec v-overview" id="ai"><h2>Answer</h2><p class="muted small">An AI can write a short answer using only the ' + passages.length + ' passages below, citing each one.</p><button>Write an answer from these passages</button></section>' : '') +
      '<h2>What the texts say</h2>' + (passages.length ? '' : '<p>No passages found. Try different words.</p>') +
      passages.map((p, i) => (HEAD[p.faith] !== last ? '<h3>' + (last = HEAD[p.faith]) + '</h3>' : '') +
        '<div class="hit" id="p' + (i + 1) + '"><a href="' + p.href + '"><span class="num">[' + (i + 1) + ']</span> ' + esc(p.source) + '</a><p>' + esc(p.text.slice(0, 700)).replace(hl, '<mark>$1</mark>') + (p.text.length > 700 ? '…' : '') + '</p></div>').join('') +
      '<p class="muted small">These passages were chosen by matching the words of your question, a few from each tradition, so some will be off the point. They are a starting point, not a ruling. Use <a href="#/search/' + encodeURIComponent(words.join(' ')) + '">Search</a> to see every match.</p>';
    const box = document.getElementById('ai');
    if (box) box.querySelector('button').addEventListener('click', () => aiAnswer(box, q, passages));
  }

  async function aiAnswer(box, question, passages) {
    const out = document.createElement('div');
    box.querySelector('button').remove();
    box.querySelector('p').textContent = 'Writing…';
    box.appendChild(out);
    const show = text => {
      out.innerHTML = text.split(/\n\s*\n/).map(par => '<p>' + rich(par).replace(/\[(\d+)\]/g, (m, n) => passages[n - 1] ? '<a class="ref" href="' + passages[n - 1].href + '" title="' + esc(passages[n - 1].source) + '">[' + n + ']</a>' : m) + '</p>').join('');
    };
    try {
      const r = await fetch(CHAT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, passages: passages.map(p => ({ source: p.source, text: p.text })) }) });
      if (!r.ok || !/text\/plain/.test(r.headers.get('Content-Type') || '')) {
        const err = await r.json().catch(() => null);
        throw new Error(err && err.error ? err.error : 'AI answers are not switched on for this copy of the site.');
      }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        show(text);
      }
      box.querySelector('p.muted').textContent = 'Written by an AI from the numbered passages below. Check each point against its source.';
    } catch (e) {
      box.querySelector('p.muted').textContent = e.message + ' The passages below are what an answer would be built from.';
    }
  }

  /* ---------- what each tradition believes ---------- */
  const FAITH_NAME = { christian: 'Christianity', muslim: 'Islam', jewish: 'Judaism' };
  const beliefCards = () => '<ul class="booklist">' + B.traditions.map(t => '<li><a href="#/beliefs/' + t.slug + '">' + esc(t.short) + '</a></li>').join('') + '</ul>';
  function beliefs(slug) {
    if (!slug) {
      document.title = 'Beliefs · Scripture Q&A';
      app.innerHTML = '<h1>What each tradition believes</h1><p class="lede">A summary of each tradition in its own terms. Every point links to the scripture or the document it rests on.</p>' +
        Object.keys(FAITH_NAME).map(f => '<h2>' + FAITH_NAME[f] + '</h2><ul class="cards">' + B.traditions.filter(t => t.faith === f).map(t =>
          '<li><a href="#/beliefs/' + t.slug + '"><strong>' + esc(t.name) + '</strong><span>' + esc(t.summary) + '</span></a></li>').join('') + '</ul>').join('') +
        '<h2>Compare</h2>' + compareList() + '<p class="status">Draft summaries. Not yet reviewed by a priest, imam, rabbi or scholar.</p>';
      return;
    }
    const t = B.traditions.find(x => x.slug === slug);
    if (!t) return notFound();
    document.title = t.name + ' · Scripture Q&A';
    app.innerHTML = '<p class="crumbs"><a href="#/beliefs">Beliefs</a> › ' + FAITH_NAME[t.faith] + '</p><h1>' + esc(t.name) + '</h1><p class="lede">' + esc(t.summary) + '</p>' +
      t.sections.map(s => '<section class="sec v-' + t.faith + '"><h2>' + esc(s.h) + '</h2><ul>' + s.points.map(p => '<li>' + rich(p) + '</li>').join('') + '</ul></section>').join('') +
      '<h2>Read their texts</h2><ul class="toc">' + t.texts.map(x => '<li><a href="#/' + encodeURI(x[0]) + '">' + esc(x[1]) + '</a></li>').join('') + '</ul>' +
      '<h2>Compare with the others</h2>' + compareList() +
      '<p class="status">Draft summary. Not yet reviewed by a priest, imam, rabbi or scholar.</p>';
  }
  const compareList = () => '<ul class="booklist">' + B.compare.map(c => '<li><a href="#/compare/' + c.slug + '">' + esc(c.title) + '</a></li>').join('') + '</ul>';
  function compareView(slug) {
    if (!slug) {
      document.title = 'Compare · Scripture Q&A';
      app.innerHTML = '<p class="crumbs"><a href="#/beliefs">Beliefs</a></p><h1>Compare the traditions</h1><p class="lede">One topic at a time, each tradition side by side.</p>' + compareList();
      return;
    }
    const i = B.compare.findIndex(x => x.slug === slug), c = B.compare[i];
    if (!c) return notFound();
    document.title = c.title + ' compared · Scripture Q&A';
    const qs = (c.more || []).map(m => C.questions.find(q => 'q/' + q.slug === m)).filter(Boolean);
    app.innerHTML = '<p class="crumbs"><a href="#/beliefs">Beliefs</a> › <a href="#/compare">Compare</a></p><h1>' + esc(c.title) + '</h1>' +
      c.rows.map(r => '<section class="sec v-' + r[0] + '"><span class="tag">' + esc(r[1]) + '</span><p>' + rich(r[2]) + '</p></section>').join('') +
      (qs.length ? '<h2>The arguments in full</h2>' + questionCards(qs) : '') +
      '<div class="pager">' + (i > 0 ? '<a class="btn ghost" href="#/compare/' + B.compare[i - 1].slug + '">← ' + esc(B.compare[i - 1].title) + '</a>' : '<span></span>') +
      (i < B.compare.length - 1 ? '<a class="btn ghost" href="#/compare/' + B.compare[i + 1].slug + '">' + esc(B.compare[i + 1].title) + ' →</a>' : '') + '</div>';
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
  function setTr(t) { tr = t; pref[trById[t].corpus] = t; trSel.value = t; store.set('tr', t); store.set('tr-' + trById[t].corpus, t); }
  function route() {
    renderId++;
    const [name, ...a] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
    document.querySelectorAll('.top nav a').forEach(l => l.classList.toggle('on',
      l.getAttribute('href') === '#/' + ({ q: 'questions', topic: 'questions', read: 'books', compare: 'beliefs', go: 'lib' }[name] || name)));
    window.scrollTo(0, 0);
    const views = { '': home, questions, q: question, topic, books, read, search: () => search(a.join('/')), about, lib: () => library(a), beliefs, compare: compareView, go, ask: () => ask(a.join('/')) };
    Promise.resolve((views[name] || notFound)(...a)).catch(e => {
      app.innerHTML = '<h1>Something went wrong</h1><p class="muted">' + esc(e.message) + '</p>';
    });
  }

  Promise.all(['data/index.json', 'content/questions.json', 'content/disputes.json', 'content/beliefs.json'].map(getJSON)).then(([m, c, d, b]) => {
    M = m; C = c; B = b;
    C.questions = C.questions.concat(d.questions);
    M.translations.forEach(t => { trById[t.id] = t; t.chapters = Object.fromEntries(t.books); });
    setupRefs();
    const og = (label, f) => '<optgroup label="' + label + '">' + M.translations.filter(f).map(t => '<option value="' + t.id + '">' + esc(t.name.replace(/^Quran: /, '')) + '</option>').join('') + '</optgroup>';
    trSel.innerHTML = og('Bible in English', t => t.corpus === 'bible' && t.lang === 'en') + og('Bible in the original languages', t => t.corpus === 'bible' && t.lang !== 'en') +
      og('Quran in English', t => t.corpus === 'quran' && t.lang === 'en') + og('Quran in Arabic', t => t.corpus === 'quran' && t.lang === 'ar');
    ['bible', 'quran'].forEach(c => { const v = store.get('tr-' + c); if (trById[v] && trById[v].corpus === c) pref[c] = v; });
    setTr(trById[store.get('tr')] ? store.get('tr') : 'WEB');
    trSel.addEventListener('change', () => {
      const m = location.hash.match(/^#\/(read|books)\/[A-Z]+(.*)$/);
      const same = trById[trSel.value].corpus === trById[tr].corpus;
      setTr(trSel.value);
      if (m && (same || m[1] === 'books')) location.hash = '#/' + m[1] + '/' + tr + (m[1] === 'books' ? '' : m[2]);
      else if (m) location.hash = '#/books/' + tr; else route();
    });
    window.addEventListener('hashchange', route);
    route();
  }).catch(e => { app.innerHTML = '<h1>Could not load the site data</h1><p class="muted">' + esc(e.message) + '</p>'; });
})();
