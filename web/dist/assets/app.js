/* Local, read-only navigation. All searchable data is a generated public projection. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const themeButton = $('#theme-toggle');
  function setTheme(dark, persist = true) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const themeColor = $('meta[name="theme-color"]');
    if (themeColor) themeColor.content = dark ? '#111714' : '#FFFFFF';
    if (themeButton) {
      themeButton.setAttribute('aria-pressed', String(dark));
      themeButton.setAttribute('aria-label', dark ? '라이트모드로 전환' : '다크모드로 전환');
      $('.theme-label').textContent = dark ? '라이트모드' : '다크모드';
      $('.theme-icon').textContent = dark ? '☀' : '◐';
    }
    if (persist) try { localStorage.setItem('meje-theme', dark ? 'dark' : 'light'); } catch (_) {}
  }
  setTheme(document.documentElement.dataset.theme === 'dark', false);
  themeButton?.addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
  const norm = s => (s || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s_-]+/g, '');
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const seenKey = 'meje-seen-cards-v1';
  // Public GA4 measurement ID. Leave blank until the property is ready.
  const analyticsMeasurementId = 'G-6YDW0J42W6';
  if (/^G-[A-Z0-9]+$/.test(analyticsMeasurementId)) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', analyticsMeasurementId);
    const analyticsScript = document.createElement('script');
    analyticsScript.async = true;
    analyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(analyticsMeasurementId)}`;
    document.head.append(analyticsScript);
  }
  const cardIdPattern = /^(?:MEJE-KW-\d+|ML-[FT]\d+|MM-[A-Z]+-[A-Z0-9-]+)$/;
  function readSeenCards() {
    try {
      const saved = JSON.parse(localStorage.getItem(seenKey) || '[]');
      return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string' && cardIdPattern.test(id)) : []);
    } catch (_) { return new Set(); }
  }
  let seenCards = readSeenCards();
  const track = (name, params) => { if (typeof window.gtag === 'function') window.gtag('event', name, params); };
  function seenButtonHTML(id, title, detail = false) {
    const marked = seenCards.has(id);
    const label = `${title} · ${marked ? '본 카드 표시 해제' : '본 카드로 표시'}`;
    return `<button type="button" class="seen-button${detail ? ' detail-seen-button' : ''}" data-seen-card="${esc(id)}" data-seen-title="${esc(title)}" aria-pressed="${marked}" aria-label="${esc(label)}" title="${esc(label)}"><span class="heart" aria-hidden="true">${marked ? '♥' : '♡'}</span>${detail ? `<span class="seen-label">${marked ? '봤어요' : '본 카드로 표시'}</span>` : ''}</button>`;
  }
  function refreshSeenButtons(id) {
    document.querySelectorAll('button[data-seen-card]').forEach(button => {
      if (id && button.dataset.seenCard !== id) return;
      const marked = seenCards.has(button.dataset.seenCard);
      const label = `${button.dataset.seenTitle} · ${marked ? '본 카드 표시 해제' : '본 카드로 표시'}`;
      button.setAttribute('aria-pressed', String(marked));
      button.setAttribute('aria-label', label);
      button.title = label;
      button.querySelector('.heart').textContent = marked ? '♥' : '♡';
      const text = button.querySelector('.seen-label');
      if (text) text.textContent = marked ? '봤어요' : '본 카드로 표시';
    });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-seen-card]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const id = button.dataset.seenCard;
    if (!cardIdPattern.test(id)) return;
    const marked = !seenCards.has(id);
    if (marked) seenCards.add(id); else seenCards.delete(id);
    try { localStorage.setItem(seenKey, JSON.stringify([...seenCards])); } catch (_) {}
    refreshSeenButtons(id);
    track('motif_seen_toggle', {card_id: id, seen_status: marked ? 'marked' : 'unmarked'});
  });
  addEventListener('storage', event => {
    if (event.key !== seenKey) return;
    seenCards = readSeenCards();
    refreshSeenButtons();
  });
  const detailCard = $('.detail-reading[data-card-id]');
  if (detailCard) {
    const heading = detailCard.querySelector('h1');
    const after = detailCard.querySelector(':scope > .original-term') || heading;
    if (after) after.insertAdjacentHTML('afterend', seenButtonHTML(detailCard.dataset.cardId, heading?.textContent?.trim() || '카드', true));
  }
  const input = $('#card-search') || $('#tree-search');
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && input) {
      event.preventDefault(); input.focus();
    }
  });
  const catalog = $('#catalog-data');
  if (catalog) {
    $('#card-grid').setAttribute('aria-busy', 'true');
    const {chunkBase, pageSize} = JSON.parse(catalog.textContent);
    const search = $('#card-search'), facet = $('#facet-filter'), state = $('#state-filter'), sort = $('#sort');
    let current = 1, tagFilter = '';
    let cards = [], cardTitles = new Map(), ready = false, renderToken = 0;
    let visitContext = '', visitedPages = new Set();
    const chunkCache = new Map();
    window.MOTIF_CATALOG_CHUNKS = Object.create(null);
    function loadChunk(number) {
      if (!chunkCache.has(number)) chunkCache.set(number, new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${chunkBase}${number}.js`;
        script.onload = () => {
          script.remove();
          const rows = window.MOTIF_CATALOG_CHUNKS[number];
          delete window.MOTIF_CATALOG_CHUNKS[number];
          if (rows) resolve(rows); else reject(new Error(`Missing catalog chunk ${number}`));
        };
        script.onerror = () => { script.remove(); reject(new Error(`Could not load catalog chunk ${number}`)); };
        document.head.append(script);
      }));
      return chunkCache.get(number);
    }
    const collator = new Intl.Collator('ko');
    const cardHTML = c => {
      const chips = (c.thumbnail_tags || []).map((label, index) => `<span class="thumb-chip ${index ? 'thumb-chip-applied' : 'thumb-chip-primary'}">${esc(label)}</span>`).join('');
      return `<div class="catalog-card"><a class="motif-card" data-card-id="${esc(c.id)}" data-row-version="${esc(c.row_version)}" href="${esc(c.entry_url || `cards/${c.id}/index.html`)}" style="--accent:${esc(c.accent)};--tab:${esc(c.tab)}"><div class="thumb-mark" aria-hidden="true"></div><h3 class="thumb-title">${esc(c.title)}</h3><div class="thumb-tags">${chips}</div></a>${seenButtonHTML(c.id, c.title)}</div>`;
    };
    function readURL() {
      const p = new URLSearchParams(location.search);
      search.value = p.get('q') || ''; facet.value = p.get('facet') || ''; state.value = p.get('state') || ''; tagFilter = p.get('tag') || '';
      document.querySelectorAll('.site-header nav a').forEach(a => a.removeAttribute('aria-current'));
      const active = document.querySelector(`.site-header nav a[data-menu="${state.value === 'unset' ? 'unset' : 'cards'}"]`);
      if (active) active.setAttribute('aria-current', 'page');
      sort.value = p.get('sort') === 'newest' ? 'newest' : 'title'; current = Math.max(1, Number.parseInt(p.get('page'), 10) || 1);
    }
    function setURL(push = false) {
      const p = new URLSearchParams();
      if (search.value) p.set('q', search.value);
      if (facet.value) p.set('facet', facet.value);
      if (tagFilter) p.set('tag', tagFilter);
      if (state.value) p.set('state', state.value);
      if (sort.value === 'newest') p.set('sort', sort.value);
      if (current > 1) p.set('page', current);
      const url = location.pathname + (p.size ? '?' + p : '');
      history[push ? 'pushState' : 'replaceState'](null, '', url);
    }
    function rememberPage() {
      const context = JSON.stringify([search.value, facet.value, tagFilter, state.value, sort.value]);
      if (context !== visitContext) {
        visitContext = context;
        visitedPages = new Set();
        try {
          const saved = JSON.parse(sessionStorage.getItem('motif-visited-pages') || 'null');
          if (saved?.context === context && Array.isArray(saved.pages)) visitedPages = new Set(saved.pages);
        } catch (_) {}
      }
      visitedPages.add(current);
      try { sessionStorage.setItem('motif-visited-pages', JSON.stringify({context, pages: [...visitedPages]})); } catch (_) {}
    }
    function paginationHTML(total) {
      const start = Math.floor((current - 1) / 10) * 10 + 1;
      const end = Math.min(total, start + 9);
      const numbers = Array.from({length: end - start + 1}, (_, index) => {
        const page = start + index;
        const state = page === current ? ' is-current' : visitedPages.has(page) ? ' is-visited' : '';
        return `<button type="button" class="page-number${state}" data-page="${page}" ${page === current ? 'aria-current="page"' : ''} aria-label="${page}페이지">${page}</button>`;
      }).join('');
      return `<button type="button" class="page-skip" data-page="${Math.max(1, start - 10)}" aria-label="이전 10페이지" ${start === 1 ? 'disabled' : ''}>‹</button>${numbers}<button type="button" class="page-skip" data-page="${Math.min(total, start + 10)}" aria-label="다음 10페이지" ${end === total ? 'disabled' : ''}>›</button>`;
    }
    async function render(updateURL = true, push = false) {
      if (!ready) return;
      const token = ++renderToken;
      const grid = $('#card-grid');
      grid.setAttribute('aria-busy', 'true');
      const q = norm(search.value);
      let matches = cards.filter(c => (!facet.value || c.facet_id === facet.value) && (!tagFilter || (c.browse_path || c.tag_path || []).includes(tagFilter)) && (state.value === 'defined' ? c.has_summary : state.value === 'unset' ? !c.has_summary : true) && (!q || norm([c.title, c.original, ...c.aliases].join(' ')).includes(q)));
      if (sort.value === 'newest') {
        matches = [...matches].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.source_order - a.source_order);
      } else {
        matches = [...matches].sort((a, b) => collator.compare(a.title, b.title) || a.id.localeCompare(b.id));
      }
      const total = Math.max(1, Math.ceil(matches.length / pageSize));
      current = Math.min(current, total);
      if (updateURL) setURL(push);
      const pageCards = matches.slice((current - 1) * pageSize, current * pageSize);
      try {
        const chunks = await Promise.all([...new Set(pageCards.map(c => c.chunk))].map(loadChunk));
        if (token !== renderToken) return;
        const visibleById = new Map(chunks.flat().map(c => [c.id, c]));
        grid.innerHTML = pageCards.map(c => cardHTML(visibleById.get(c.id))).join('');
      } catch (error) {
        if (token !== renderToken) return;
        grid.innerHTML = '';
        $('#empty-state').hidden = false;
        $('#empty-state').textContent = '카드 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.';
        console.error(error);
        grid.setAttribute('aria-busy', 'false');
        return;
      }
      $('#result-count').textContent = `${tagFilter ? (cardTitles.get(tagFilter) || tagFilter) : state.value === 'unset' ? '미설정 카드' : q || facet.value || state.value ? '검색 결과' : '전체'} ${matches.length.toLocaleString('ko')}장${matches.length ? ` · ${current} / ${total}` : ''}`;
      $('#empty-state').hidden = matches.length > 0;
      $('#empty-state').textContent = state.value === 'unset' && !q && !facet.value && !tagFilter
        ? '현재 설명을 기다리는 카드가 없습니다.'
        : '일치하는 카드가 없습니다. 다른 이름이나 분류로 찾아보세요.';
      if (matches.length) rememberPage();
      const pageMarkup = matches.length ? paginationHTML(total) : '';
      $('#pagination-top').innerHTML = pageMarkup;
      $('#pagination').innerHTML = pageMarkup;
      document.querySelectorAll('[data-facet-link]').forEach(a => {
        const selected = a.dataset.facetLink === facet.value;
        a.classList.toggle('selected', selected);
        if (selected) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      grid.setAttribute('aria-busy', 'false');
    }
    let searchTimer = 0, lastTrackedSearch = '';
    function trackSearch() {
      clearTimeout(searchTimer);
      const term = search.value.trim();
      if (!term || term.length > 100 || /@|\d{3}[-. ]?\d{3,4}[-. ]?\d{4}/.test(term)) { lastTrackedSearch = ''; return; }
      searchTimer = setTimeout(() => {
        if (term !== lastTrackedSearch) {
          track('view_search_results', {search_term: term});
          lastTrackedSearch = term;
        }
      }, 800);
    }
    search.addEventListener('input', () => { current = 1; render(); trackSearch(); });
    [facet, state, sort].forEach(el => el.addEventListener('change', () => {
      if (el === facet) tagFilter = '';
      current = 1; render();
      track('catalog_filter', {filter_type: el.id, filter_value: el.value || 'all'});
    }));
    $('#catalog-form').addEventListener('submit', e => { e.preventDefault(); current = 1; render(); trackSearch(); });
    $('#card-grid').addEventListener('click', event => {
      const card = event.target.closest('a.motif-card[data-card-id]');
      if (card) track('select_content', {content_type: 'motif_card', item_id: card.dataset.cardId});
    });
    document.querySelectorAll('[data-facet-link]').forEach(a => a.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault(); facet.value = a.dataset.facetLink; tagFilter = ''; current = 1; render(true, true);
      track('catalog_filter', {filter_type: 'facet', filter_value: facet.value || 'all'});
    }));
    document.querySelectorAll('.pagination').forEach(nav => nav.addEventListener('click', e => {
      const button = e.target.closest('button[data-page]');
      if (!button || button.disabled) return;
      current = Number(button.dataset.page); render(true, true); $('#catalog-form').scrollIntoView({block:'start'});
      track('catalog_page', {page_number: current});
    }));
    addEventListener('popstate', () => { readURL(); render(false); });
    readURL();
    try {
      cards = window.MOTIF_CATALOG_INDEX.cards;
      cardTitles = new Map(cards.map(c => [c.id, c.title]));
      ready = true;
      render(false);
    } catch (error) {
      console.error(error);
      $('#card-grid').setAttribute('aria-busy', 'false');
      $('#empty-state').hidden = false;
      $('#empty-state').textContent = '카드 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.';
    }
  }
  const treeInput = $('#tree-search');
  if (treeInput) {
    const facets = [...document.querySelectorAll('.facet-tree')];
    const groups = [...document.querySelectorAll('.tree-group')];
    for (const d of [...facets, ...groups]) d.dataset.initialOpen = d.open ? '1' : '0';
    function searchTree() {
      const q = norm(treeInput.value); let hits = 0;
      for (const f of facets) {
        const facetMatch = q && norm(f.querySelector(':scope > summary').textContent).includes(q);
        let facetVisible = !q || facetMatch;
        for (const g of f.querySelectorAll('.tree-group')) {
          const groupMatch = facetMatch || (q && norm(g.dataset.search || g.querySelector('summary').textContent).includes(q));
          let visible = !q || groupMatch;
          for (const leaf of g.querySelectorAll('.tree-leaf')) {
            const match = !q || groupMatch || norm(leaf.dataset.search).includes(q);
            leaf.hidden = !match; if (match) { visible = true; if (q) hits++; }
          }
          g.hidden = !visible; g.open = q ? visible : g.dataset.initialOpen === '1';
          if (visible) facetVisible = true;
        }
        f.hidden = !facetVisible; f.open = q ? facetVisible : f.dataset.initialOpen === '1';
      }
      $('#tree-search-result').textContent = q ? `${hits.toLocaleString('ko')}개 세부 키워드가 연결됩니다.` : '';
      const p = new URLSearchParams(); if (treeInput.value) p.set('q', treeInput.value);
      history.replaceState(null, '', location.pathname + (p.size ? '?' + p : '') + location.hash);
    }
    treeInput.value = new URLSearchParams(location.search).get('q') || '';
    treeInput.addEventListener('input', searchTree);
    if (treeInput.value) searchTree();
    function openHash() {
      const id = decodeURIComponent(location.hash.slice(1));
      const target = document.getElementById(id);
      if (target?.classList.contains('facet-tree')) { target.open = true; target.scrollIntoView({block:'start'}); }
    }
    addEventListener('hashchange', openHash); openHash();
  }
})();

