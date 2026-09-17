/**
 * STALLHART WIKI — Ortak JS Modülü v3
 * Fuse.js bulanık arama + küresel index + nav + dil + yardımcılar
 */
'use strict';

/* ─── DİL ──────────────────────────────────────────────── */
const Lang = (() => {
  let current = localStorage.getItem('sw-lang') || 'tr';
  function get() { return current; }
  function set(l) {
    current = l; localStorage.setItem('sw-lang', l);
    document.querySelectorAll('[data-lang-btn]').forEach(b => {
      b.textContent = l === 'tr' ? 'EN' : 'TR';
    });
    document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }
  function toggle() { set(current === 'tr' ? 'en' : 'tr'); }
  function t(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[current] || obj.tr || obj.en || '';
  }
  return { get, set, toggle, t };
})();

/* ─── VERİ YÜKLEYİCİ ──────────────────────────────────── */
const DataCache = {};
async function loadData(file) {
  if (DataCache[file]) return DataCache[file];
  const res = await fetch(`${getBasePath()}data/${file}`);
  if (!res.ok) throw new Error(`Veri yüklenemedi: ${file}`);
  const data = await res.json();
  DataCache[file] = data;
  return data;
}
function getBasePath() {
  const depth = (location.pathname.match(/\//g) || []).length - 1;
  return depth > 0 ? '../'.repeat(depth) : './';
}

/* ─── KÜRESEL ARAMA (FUSE.JS DESTEKLI) ─────────────────── */
const Search = (() => {
  let index = [];
  let fuse = null;
  let loaded = false;
  let focusIdx = -1;

  async function buildIndex() {
    if (loaded) return;
    const base = getBasePath();

    try {
      /* Karakterler */
      const cData = await loadData('characters.json');
      cData.characters.forEach(c => {
        index.push({
          type: 'karakter', typeLabel: { tr: 'Karakter', en: 'Character' },
          id: c.id, group: c.group || 'other',
          name: Lang.t(c.name),
          sub: Lang.t(c.house) + ' · ' + Lang.t(c.title),
          bio: Lang.t(c.bio).substring(0, 120),
          url: `${base}karakter-sablon.html?id=${c.id}`
        });
      });

      /* Bölümler */
      const bData = await loadData('chapters.json');
      bData.chapters.forEach(ch => {
        index.push({
          type: 'bolum', typeLabel: { tr: 'Bölüm', en: 'Chapter' },
          id: 'b' + ch.id,
          name: `${ch.num}. ${Lang.t(ch.title)}`,
          sub: Lang.t(ch.pov),
          bio: Lang.t(ch.synopsis).substring(0, 120),
          url: `${base}bolumler.html#bolum-${ch.id}`
        });
      });

      /* Sözlük */
      const lData = await loadData('lore.json');
      lData.glossary.forEach(g => {
        index.push({
          type: 'sozluk', typeLabel: { tr: 'Sözlük', en: 'Glossary' },
          id: g.id,
          name: Lang.t(g.term),
          sub: `${g.type} · ${Lang.t(g.def).substring(0, 60)}…`,
          bio: Lang.t(g.def).substring(0, 120),
          url: `${base}lore.html#${g.id}`
        });
      });

      /* Haneler */
      const hData = await loadData('houses.json');
      hData.provinces.forEach(prov => {
        prov.houses.forEach(h => {
          index.push({
            type: 'hane', typeLabel: { tr: 'Hane', en: 'House' },
            id: h.id,
            name: h.name + ' — ' + Lang.t(h.meaning),
            sub: Lang.t(prov.name),
            bio: Lang.t(h.desc).substring(0, 120),
            url: `${base}haneler.html`
          });
        });
      });

      /* Alıntılar */
      const qData = await loadData('quotes.json');
      qData.quotes.forEach((q, i) => {
        index.push({
          type: 'alinti', typeLabel: { tr: 'Alıntı', en: 'Quote' },
          id: 'q' + i,
          name: Lang.t(q.speaker),
          sub: Lang.t(q.text).substring(0, 80) + '…',
          bio: Lang.t(q.text).substring(0, 120),
          url: `${base}alintılar.html`
        });
      });

      loaded = true;

      /* Fuse.js yükle */
      await loadFuse();
      if (window.Fuse) {
        fuse = new window.Fuse(index, {
          keys: [
            { name: 'name',  weight: 0.5 },
            { name: 'sub',   weight: 0.3 },
            { name: 'bio',   weight: 0.2 }
          ],
          threshold: 0.38,
          includeScore: true,
          minMatchCharLength: 2
        });
      }
    } catch (e) { console.warn('Arama indeksi hatası:', e); }
  }

  function loadFuse() {
    if (window.Fuse) return Promise.resolve();
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/fuse.js/7.0.0/fuse.min.js';
      s.onload = resolve; s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  function query(q) {
    if (!q || q.length < 2) return [];
    if (fuse) {
      return fuse.search(q).slice(0, 12).map(r => r.item);
    }
    /* Fuse yüklenmediyse basit arama */
    const lq = q.toLowerCase();
    return index.filter(item =>
      item.name.toLowerCase().includes(lq) ||
      item.sub.toLowerCase().includes(lq)
    ).slice(0, 12);
  }

  function highlight(text, q) {
    if (!q || !text) return text || '';
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return text.slice(0, idx)
      + `<mark style="background:rgba(196,150,42,.25);color:var(--parchl)">`
      + text.slice(idx, idx + q.length) + `</mark>`
      + text.slice(idx + q.length);
  }

  const TYPE_ICON = { karakter: 'K', bolum: 'B', sozluk: 'S', hane: 'H', alinti: 'A' };

  function init() {
    const overlay = document.getElementById('search-overlay');
    const input   = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    if (!overlay || !input || !results) return;

    function open() {
      overlay.classList.add('open');
      input.focus();
      buildIndex();
      render('', []);
    }
    function close() {
      overlay.classList.remove('open');
      input.value = '';
      results.innerHTML = '';
      focusIdx = -1;
    }

    function render(q, items) {
      const l = Lang.get();
      if (!q) {
        results.innerHTML = `<p class="search-empty">
          ${l === 'tr' ? 'Karakter, bölüm, hane veya lore terimi ara…' : 'Search characters, chapters, houses or lore terms…'}
        </p>`; return;
      }
      if (!items.length) {
        results.innerHTML = `<p class="search-empty">
          ${l === 'tr' ? `"${q}" için sonuç bulunamadı.` : `No results for "${q}".`}
        </p>`; return;
      }
      results.innerHTML = items.map((item, i) => `
        <a class="sr-item" href="${item.url}" data-idx="${i}">
          <div class="sr-icon">${TYPE_ICON[item.type] || '?'}</div>
          <div>
            <div class="sr-name">${highlight(item.name, q)}</div>
            <div class="sr-meta">${highlight(item.sub, q)}</div>
          </div>
          <div class="sr-type">${Lang.t(item.typeLabel)}</div>
        </a>`).join('');
      focusIdx = -1;
    }

    input.addEventListener('keydown', e => {
      const items = results.querySelectorAll('.sr-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = Math.min(focusIdx + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusIdx = Math.max(focusIdx - 1, -1); }
      else if (e.key === 'Escape') { close(); return; }
      else if (e.key === 'Enter' && focusIdx >= 0) { e.preventDefault(); items[focusIdx]?.click(); return; }
      items.forEach((el, i) => el.classList.toggle('focused', i === focusIdx));
      if (focusIdx >= 0) items[focusIdx]?.scrollIntoView({ block: 'nearest' });
    });

    input.addEventListener('input', () => {
      const q = input.value.trim();
      render(q, query(q));
      focusIdx = -1;
    });

    document.querySelectorAll('[data-search-btn]').forEach(btn => btn.addEventListener('click', open));
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); overlay.classList.contains('open') ? close() : open(); }
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
  }

  return { init, buildIndex };
})();

/* ─── NAV ─────────────────────────────────────────────── */
function initNav() {
  const ham   = document.getElementById('nav-ham');
  const links = document.getElementById('nav-links');
  if (ham && links) {
    ham.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      ham.setAttribute('aria-expanded', open);
    });
    document.addEventListener('click', e => {
      if (!ham.contains(e.target) && !links.contains(e.target)) links.classList.remove('open');
    });
  }
  const up = document.getElementById('scroll-up');
  if (up) {
    window.addEventListener('scroll', () => up.classList.toggle('vis', window.scrollY > 400), { passive: true });
    up.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href')?.split('/').pop() || '';
    a.classList.toggle('active', href === page || (page.startsWith('karakter') && href.startsWith('karakter')));
  });
}

/* ─── DİL BUTONU ───────────────────────────────────────── */
function initLang(onChangeCb) {
  document.querySelectorAll('[data-lang-btn]').forEach(b => {
    b.textContent = Lang.get() === 'tr' ? 'EN' : 'TR';
    b.addEventListener('click', () => Lang.toggle());
  });
  if (onChangeCb) document.addEventListener('langchange', () => onChangeCb(Lang.get()));
}

/* ─── FAQ ACCORDION ────────────────────────────────────── */
function initFaq() {
  document.querySelectorAll('.fi').forEach(item => {
    item.querySelector('.fq')?.addEventListener('click', () => item.classList.toggle('on'));
  });
}

/* ─── YER İMİ & OKUMA TAKİPÇİSİ ───────────────────────── */
const Bookmarks = {
  key: 'sw-bookmarks',
  get() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  has(id) { return this.get().includes(id); },
  toggle(id) {
    const list = this.get(); const idx = list.indexOf(id);
    idx >= 0 ? list.splice(idx, 1) : list.push(id);
    localStorage.setItem(this.key, JSON.stringify(list));
    return idx < 0;
  }
};
const ReadTracker = {
  key: 'sw-read',
  get() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  mark(id) { const l = this.get(); if (!l.includes(id)) { l.push(id); localStorage.setItem(this.key, JSON.stringify(l)); } },
  unmark(id) { localStorage.setItem(this.key, JSON.stringify(this.get().filter(x => x !== id))); },
  has(id) { return this.get().includes(id); }
};

/* ─── YARDIMCILAR ──────────────────────────────────────── */
function groupClass(g) {
  return ['stallhart','arhan','solgar','selya','rebel','court','arathen','other'].includes(g) ? g : 'other';
}
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── OVERLAY HTML ─────────────────────────────────────── */
function injectSearchOverlay() {
  if (document.getElementById('search-overlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="search-overlay" id="search-overlay" role="dialog" aria-label="Arama">
      <div class="search-box" role="search">
        <div class="search-input-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
          <input type="search" id="search-input" placeholder="Karakter, bölüm, hane, terim…" autocomplete="off" spellcheck="false">
          <kbd id="search-close-kbd">Esc</kbd>
        </div>
        <div id="search-results"></div>
        <div class="search-footer">
          <span>↑↓ Gezin</span><span>↵ Git</span><span>Esc Kapat</span>
        </div>
      </div>
    </div>`);
}

function injectScrollUp() {
  if (document.getElementById('scroll-up')) return;
  document.body.insertAdjacentHTML('beforeend',
    `<a class="up" id="scroll-up" aria-label="Yukarı çık">
      <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
    </a>`);
}

function injectFooter() {
  if (document.getElementById('site-footer')) return;
  document.body.insertAdjacentHTML('beforeend',
    `<footer id="site-footer">
      <p>Stallhart Evreni · Son İmparator</p>
      <small>© ${new Date().getFullYear()} craesx — Tüm hakları saklıdır.</small>
    </footer>`);
}

/* ─── NAV HTML ─────────────────────────────────────────── */
function injectNav(activePage) {
  if (document.getElementById('site-nav')) return;
  const base = getBasePath();
  const navLinks = [
    { href: 'index.html',         tr: 'Ana Sayfa',  en: 'Home' },
    { href: 'karakterler.html',   tr: 'Karakterler',en: 'Characters' },
    { href: 'haneler.html',       tr: 'Haneler',    en: 'Houses' },
    { href: 'lore.html',          tr: 'Evren',      en: 'Lore' },
    { href: 'harita.html',        tr: 'Harita',     en: 'Map' },
    { href: 'bolumler.html',      tr: 'Bölümler',   en: 'Chapters' },
    { href: 'soy-agaci.html',     tr: 'Soy Ağacı',  en: 'Family Tree' },
    { href: 'alintılar.html',     tr: 'Sözler',     en: 'Quotes' }
  ];
  const linksHTML = navLinks.map(l =>
    `<li><a href="${base}${l.href}" data-tr="${l.tr}" data-en="${l.en}">${l.tr}</a></li>`
  ).join('');
  document.body.insertAdjacentHTML('afterbegin', `
    <nav id="site-nav">
      <div class="nav-in">
        <a class="nav-brand" href="${base}index.html">Stallhart</a>
        <ul class="nav-links" id="nav-links">${linksHTML}</ul>
        <div class="nav-r">
          <button class="nav-search-btn" data-search-btn aria-label="Arama">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
            Ara <kbd>Ctrl K</kbd>
          </button>
          <button class="lang-btn" data-lang-btn>EN</button>
          <button class="nav-ham" id="nav-ham" aria-label="Menü" aria-expanded="false">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </nav>`);
  document.addEventListener('langchange', (e) => {
    const l = e.detail;
    document.querySelectorAll('.nav-links a[data-tr]').forEach(a => {
      a.textContent = l === 'tr' ? a.dataset.tr : a.dataset.en;
    });
  });
}

/* ─── BAŞLATICI ────────────────────────────────────────── */
function initWiki(options = {}) {
  const { onLangChange, injectFooter: doFooter = true } = options;
  injectSearchOverlay();
  injectScrollUp();
  if (doFooter) injectFooter();
  initNav();
  initLang(onLangChange);
  Search.init();
  initFaq();
  const l = Lang.get();
  if (l === 'en') {
    document.querySelectorAll('.nav-links a[data-tr]').forEach(a => { a.textContent = a.dataset.en; });
  }
}

/* ─── EXPORT ────────────────────────────────────────────── */
window.Wiki = {
  Lang, loadData, Search, Bookmarks, ReadTracker,
  initWiki, injectNav, groupClass, esc, getBasePath
};
