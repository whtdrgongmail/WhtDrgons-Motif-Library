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
      return `<a class="motif-card" data-card-id="${esc(c.id)}" data-row-version="${esc(c.row_version)}" href="${esc(c.entry_url || `cards/${c.id}/index.html`)}" style="--accent:${esc(c.accent)};--tab:${esc(c.tab)}"><div class="thumb-mark" aria-hidden="true"></div><h3 class="thumb-title">${esc(c.title)}</h3><div class="thumb-tags">${chips}</div></a>`;
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
      $('#pagination').innerHTML = matches.length ? `<button type="button" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>← 이전</button><label><span class="sr-only">목록 페이지</span><select id="page-select">${Array.from({length:total}, (_, i) => `<option value="${i+1}" ${i+1 === current ? 'selected' : ''}>${i+1}</option>`).join('')}</select></label><span>/ ${total}</span><button type="button" data-page="${current + 1}" ${current === total ? 'disabled' : ''}>다음 →</button>` : '';
      document.querySelectorAll('[data-facet-link]').forEach(a => {
        const selected = a.dataset.facetLink === facet.value;
        a.classList.toggle('selected', selected);
        if (selected) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      grid.setAttribute('aria-busy', 'false');
    }
    search.addEventListener('input', () => { current = 1; render(); });
    [facet, state, sort].forEach(el => el.addEventListener('change', () => { if (el === facet) tagFilter = ''; current = 1; render(); }));
    $('#catalog-form').addEventListener('submit', e => { e.preventDefault(); current = 1; render(); });
    document.querySelectorAll('[data-facet-link]').forEach(a => a.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault(); facet.value = a.dataset.facetLink; tagFilter = ''; current = 1; render(true, true);
    }));
    $('#pagination').addEventListener('click', e => {
      const button = e.target.closest('button[data-page]');
      if (!button || button.disabled) return;
      current = Number(button.dataset.page); render(true, true); $('#catalog-form').scrollIntoView({block:'start'});
    });
    $('#pagination').addEventListener('change', e => {
      if (e.target.id !== 'page-select') return;
      current = Number(e.target.value); render(true, true); $('#catalog-form').scrollIntoView({block:'start'});
    });
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

