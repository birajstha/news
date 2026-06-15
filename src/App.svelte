<script>
  import { onMount, onDestroy } from 'svelte';
  import NewsCard from './lib/NewsCard.svelte';
  import { streamTopHeadlines,
           getAllSources, getEnabledSources, setEnabledSources,
           getLanguagePref, setLanguagePref,
           getThemePref, setThemePref } from './lib/api.js';

  const categories = [
    { id: 'trending',   en: 'Trending 🔥',      ne: 'ट्रेन्डिङ 🔥' },
    { id: 'nepal',      en: 'Nepal 🇳🇵',        ne: 'नेपाल 🇳🇵' },
    { id: 'usa',        en: 'USA 🇺🇸',          ne: 'अमेरिका 🇺🇸' },
    { id: 'world',      en: 'World 🌐',         ne: 'विश्व 🌐' },
    { id: 'finance',    en: 'Finance 💰',       ne: 'वित्त 💰' },
    { id: 'technology', en: 'Technology 💻',    ne: 'प्रविधि 💻' },
    { id: 'ai',         en: 'AI 🤖',            ne: 'एआई 🤖' },
    { id: 'science',    en: 'Science 🔬',       ne: 'विज्ञान 🔬' },
    { id: 'sports',     en: 'Sports ⚽',        ne: 'खेलकुद ⚽' },
    { id: 'medical',    en: 'Health 🏥',        ne: 'स्वास्थ्य 🏥' },
    { id: 'gossip',     en: 'Gossip 🌟',        ne: 'गफसफ 🌟' },
  ];

  // ─── LOCALISATION ────────────────────────────────────────────────────────────
  const UI = {
    en: {
      title: 'Healthy Thoughts',
      tagline: 'USA & Nepal News for Nepalis Worldwide',
      search: 'Search news...',
      loading: 'Loading news…',
      noArticles: 'No articles found.',
      readMore: '🔗 Full Article',
      install: '📲 Install App',
      langBtn: '🇺🇸 English',
      freeService: 'This app uses free news services which can be unreliable.',
      refresh: 'Tap to refresh',
      ago: 'ago',
    },
    ne: {
      title: 'स्वस्थ विचार',
      tagline: 'विश्वभरका नेपालीहरूका लागि अमेरिका र नेपाल समाचार',
      search: 'समाचार खोज्नुहोस्...',
      loading: 'समाचार लोड हुँदैछ…',
      noArticles: 'कुनै समाचार फेला परेन।',
      readMore: '🔗 स्रोत हेर्नुहोस्',
      install: '📲 एप इन्स्टल गर्नुहोस्',
      langBtn: '🇳🇵 नेपाली',
      freeService: 'यो एप नि:शुल्क सेवाहरू प्रयोग गर्छ जुन कहिलेकाहीँ अविश्वसनीय हुन सक्छ।',
      refresh: 'रिफ्रेस गर्न थिच्नुहोस्',
      ago: 'अघि',
    }
  };

  // ─── STATE ───────────────────────────────────────────────────────────────────
  let activeCategory = 'trending';
  let nepali = typeof window !== 'undefined' ? getLanguagePref() : true;
  let dark = typeof window !== 'undefined' ? getThemePref() : true;
  let searchQuery = '';
  let searchTimeout;

  // Article cache: { categoryId: [articles] }
  let articleCache = {};
  // Track which categories have been fetched (to avoid re-fetch)
  let fetchedCategories = new Set();
  // Track if we're doing initial bulk load (show spinner for categories not yet loaded)
  let bulkLoading = true;

  // PWA install
  let deferredInstall = null;
  let showInstall = false;
  let isIOS = false;
  let showIOSGuide = false;

  // Source panel
  let showSourcePanel = false;

  // ─── DERIVED: articles to display for current category ───────────────────────
  // No API call — just filter from cache
  let displayedArticles = [];

  function updateDisplayed() {
    const all = articleCache[activeCategory];
    if (!all || !all.length) {
      displayedArticles = [];
      return;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      displayedArticles = all.filter(a =>
        (a.title + ' ' + (a.description || '')).toLowerCase().includes(q)
      );
    } else {
      displayedArticles = all;
    }
  }

  // Reactively update when category or cache changes
  // (Svelte 5: reassigning activeCategory triggers this)
  $: if (activeCategory && articleCache) {
    updateDisplayed();
  }

  // ─── FETCHING ────────────────────────────────────────────────────────────────
  async function fetchCategory(catId) {
    if (fetchedCategories.has(catId)) return;
    fetchedCategories.add(catId);

    await streamTopHeadlines(catId, (batch) => {
      articleCache = { ...articleCache, [catId]: batch };
    });
  }

  // Load all categories in parallel (background)
  async function fetchAllCategories() {
    const ids = categories.map(c => c.id);
    await Promise.allSettled(ids.map(fetchCategory));
    bulkLoading = false;
  }

  // Refresh a single category in background (updates cache silently)
  async function refreshCategory(catId) {
    // Temporarily remove from fetched so streamTopHeadlines won't use stale cache
    fetchedCategories.delete(catId);
    await fetchCategory(catId);
  }

  // ─── TAB SWITCHING (instant — no network call) ────────────────────────────────
  function setCategory(id) {
    if (id === activeCategory) return;
    activeCategory = id;
    searchQuery = '';
    // Close source panel if open
    showSourcePanel = false;
    // If this category hasn't been fetched yet, fetch it now
    if (!articleCache[id]) {
      fetchCategory(id);
    }
  }

  // ─── SEARCH ──────────────────────────────────────────────────────────────────
  function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      updateDisplayed();
    }, 300);
  }

  // ─── LANGUAGE ────────────────────────────────────────────────────────────────
  function toggleNepali() {
    nepali = !nepali;
    setLanguagePref(nepali);
  }

  // ─── THEME ───────────────────────────────────────────────────────────────────
  function toggleTheme() {
    dark = !dark;
    setThemePref(dark);
    document.documentElement.classList.toggle('dark', dark);
  }

  $: if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', dark);
  }

  // ─── TRANSLATION ─────────────────────────────────────────────────────────────
  import { translateToNepali } from './lib/api.js';
  let translations = {};
  let translatingCount = 0;

  async function translateArticle(article) {
    if (translations[article.url]) return;
    translatingCount += 1;
    const key = article.url;
    const [title, description] = await Promise.all([
      translateToNepali(article.title),
      article.description ? translateToNepali(article.description) : Promise.resolve(''),
    ]);
    translations = { ...translations, [key]: { title, description } };
    translatingCount = Math.max(0, translatingCount - 1);
  }

  function translateArticles(list) {
    for (const a of list) {
      if (!translations[a.url]) translateArticle(a);
    }
  }

  // Translated display
  $: translatedView = displayedArticles.map(a => {
    if (!nepali) return a;
    const tr = translations[a.url];
    if (!tr) return a;
    return { ...a, title: tr.title, description: tr.description };
  });

  $: if (nepali && displayedArticles.length) {
    translateArticles(displayedArticles.filter(a => !translations[a.url]));
  }

  // ─── SOURCE PANEL ────────────────────────────────────────────────────────────
  let sourcePanelActive = null; // { category: string, sources: [{name, url}], enabled: string[] }

  function openSourcePanel(catId) {
    sourcePanelActive = {
      category: catId,
      sources: getAllSources(catId),
      enabled: [...getEnabledSources(catId)]
    };
    showSourcePanel = true;
  }

  function toggleSource(sourceName) {
    if (!sourcePanelActive) return;
    const idx = sourcePanelActive.enabled.indexOf(sourceName);
    if (idx === -1) {
      sourcePanelActive = {
        ...sourcePanelActive,
        enabled: [...sourcePanelActive.enabled, sourceName]
      };
    } else if (sourcePanelActive.enabled.length > 1) {
      sourcePanelActive = {
        ...sourcePanelActive,
        enabled: sourcePanelActive.enabled.filter(s => s !== sourceName)
      };
    }
  }

  function applySources() {
    if (!sourcePanelActive) return;
    const cat = sourcePanelActive.category;
    setEnabledSources(cat, sourcePanelActive.enabled);
    showSourcePanel = false;
    sourcePanelActive = null;
    fetchedCategories.delete(cat);
    delete articleCache[cat];
    articleCache = { ...articleCache };
    fetchCategory(cat);
  }

  // ─── PWA ─────────────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) showInstall = true;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstall = e;
      showInstall = true;
    });
    window.addEventListener('appinstalled', () => { showInstall = false; showIOSGuide = false; });
  }

  async function installApp() {
    if (isIOS) { showIOSGuide = !showIOSGuide; return; }
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') showInstall = false;
    deferredInstall = null;
  }

  // ─── AUTO-REFRESH ────────────────────────────────────────────────────────────
  function isPeakHour() {
    const h = new Date().getHours();
    return (h >= 6 && h < 9) || (h >= 12 && h < 13) || (h >= 18 && h < 21);
  }

  let refreshInterval;

  function scheduleRefresh() {
    clearInterval(refreshInterval);
    const ms = isPeakHour() ? 15 * 60 * 1000 : 30 * 60 * 1000;
    refreshInterval = setInterval(() => {
      // Refresh all categories in background silently
      const ids = categories.map(c => c.id);
      for (const id of ids) {
        refreshCategory(id);
      }
      // Trigger reactive update
      articleCache = { ...articleCache };
    }, ms);
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible') {
      // Refresh the active category when user returns
      refreshCategory(activeCategory).then(() => {
        articleCache = { ...articleCache };
      });
      scheduleRefresh();
    } else {
      clearInterval(refreshInterval);
    }
  }

  // ─── LIFECYCLE ───────────────────────────────────────────────────────────────
  onMount(() => {
    // Load active category immediately, then all others in background
    fetchCategory('trending');
    fetchAllCategories();
    scheduleRefresh();
    document.addEventListener('visibilitychange', handleVisibility);
  });

  onDestroy(() => {
    clearInterval(refreshInterval);
    document.removeEventListener('visibilitychange', handleVisibility);
  });

  // ─── HELPERS ─────────────────────────────────────────────────────────────────
  function articleUrl(url) {
    if (!nepali) return url;
    return `https://translate.google.com/translate?sl=auto&tl=ne&u=${encodeURIComponent(url)}`;
  }

  $: t = nepali ? UI.ne : UI.en;
</script>

<div class="app">
  <!-- Navbar -->
  <nav class="navbar">
    <div class="nav-top">
      <div class="brand">
        <!-- no icon -->
        <div class="brand-text">
          <span class="brand-name">{nepali ? 'स्वस्थ' : 'Healthy'}<span class="accent">{nepali ? ' विचार' : ' Thoughts'}</span></span>
          <span class="brand-tag">{t.tagline}</span>
        </div>
      </div>
      <div class="nav-actions">
        {#if showInstall}
          <button class="install-icon-btn" on:click={installApp} title={t.install}>📲</button>
        {/if}
        <button class="source-nav-btn" on:click={() => openSourcePanel(activeCategory)} title={nepali ? 'स्रोतहरू' : 'Sources'}>⚙️</button>
        <button class="lang-toggle {nepali ? 'active' : ''}" on:click={toggleNepali}>
          {nepali ? '🇳🇵' : '🇺🇸'}
        </button>
        <button class="theme-btn" on:click={toggleTheme} title={dark ? (nepali ? 'उज्यालो' : 'Light') : (nepali ? 'अँध्यारो' : 'Dark')}>
          {#if dark}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          {/if}
        </button>
      </div>
    </div>

    <div class="search-row">
      <div class="search-wrap">
        <input
          type="search"
          class="search-input"
          placeholder={t.search}
          bind:value={searchQuery}
          on:input={handleSearch}
        />
        <span class="search-icon">🔍</span>
      </div>
    </div>

    <div class="category-tabs">
      {#each categories as cat}
        <button
          class="tab {activeCategory === cat.id ? 'active' : ''}"
          on:click={() => setCategory(cat.id)}
        >{nepali ? cat.ne : cat.en}</button>
      {/each}
    </div>
  </nav>

  {#if showIOSGuide}
    <div class="ios-guide" on:click={() => showIOSGuide = false}>
      <div class="ios-guide-box" on:click|stopPropagation>
        <p class="ios-guide-title">{nepali ? 'होम स्क्रिनमा थप्नुहोस्' : 'Add to Home Screen'}</p>
        <p class="ios-guide-step">1. Safari को तल <strong>Share</strong> बटन थिच्नुहोस् <span style="font-size:1.3rem">⎙</span></p>
        <p class="ios-guide-step">2. <strong>"Add to Home Screen"</strong> छान्नुहोस् <span style="font-size:1.1rem">➕</span></p>
        <p class="ios-guide-step">3. <strong>Add</strong> थिच्नुहोस् ✅</p>
        <button class="ios-close" on:click={() => showIOSGuide = false}>✕ {nepali ? 'बन्द गर्नुहोस्' : 'Close'}</button>
      </div>
    </div>
  {/if}

  <!-- Source Selection Panel -->
  {#if showSourcePanel && sourcePanelActive}
    <div class="source-overlay" on:click={() => { showSourcePanel = false; sourcePanelActive = null; }}>
      <div class="source-panel" on:click|stopPropagation>
        <div class="source-panel-header">
          <h3>{nepali ? 'स्रोतहरू' : 'News Sources'}</h3>
          <span class="source-panel-cat">{nepali ? categories.find(c => c.id === sourcePanelActive.category)?.ne || '' : categories.find(c => c.id === sourcePanelActive.category)?.en || ''}</span>
        </div>
        <div class="source-list">
          {#each sourcePanelActive.sources as src}
            <label class="source-item">
              <input
                type="checkbox"
                checked={sourcePanelActive.enabled.includes(src.name)}
                on:change={() => toggleSource(src.name)}
              />
              <span class="source-name">{src.name}</span>
            </label>
          {/each}
        </div>
        <div class="source-panel-actions">
          <button class="source-cancel" on:click={() => { showSourcePanel = false; sourcePanelActive = null; }}>
            {nepali ? 'रद्द गर्नुहोस्' : 'Cancel'}
          </button>
          <button class="source-apply" on:click={applySources}>
            {nepali ? 'लागू गर्नुहोस्' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Main -->
  <main class="main">
    {#if !articleCache[activeCategory]}
      <div class="state-center">
        <div class="spinner"></div>
        <p>{t.loading}</p>
      </div>

    {:else if translatedView.length === 0}
      <div class="state-center">
        <div class="error-icon">🔍</div>
        <p class="error-title">{t.noArticles}</p>
        <p class="error-sub">{t.freeService}</p>
        <button class="refresh-btn" on:click={() => { fetchedCategories.delete(activeCategory); fetchCategory(activeCategory); }}>
          🔄 {nepali ? 'रिफ्रेस' : 'Refresh'}
        </button>
      </div>

    {:else}
      {#if nepali && translatingCount > 0}
        <div class="translate-bar">
          <div class="mini-spinner"></div>
          {translatingCount} {nepali ? 'समाचार अनुवाद हुँदैछ…' : 'translating…'}
        </div>
      {/if}
      <div class="feed">
        {#each translatedView as article (article.url)}
          <NewsCard
            {article}
            translating={nepali && !translations[article.url]}
            {nepali}
            readMoreLabel={t.readMore}
            href={articleUrl(article.url)}
          />
        {/each}
      </div>
    {/if}
  </main>

  <footer class="footer">
    <p>© 2026 EvanieTech · <a href="https://newsapi.org" target="_blank">NewsAPI</a></p>
  </footer>
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html) { font-size: 16px; }
  :global(body) {
    background: var(--bg);
    color: var(--text);
    font-family: 'Noto Sans Devanagari', 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  :global(a) { color: inherit; }

  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* Navbar */
  .navbar {
    position: sticky; top: 0; z-index: 100;
    background: var(--bg-nav);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
    padding-top: env(safe-area-inset-top, 0px);
  }
  .nav-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px 8px;
    gap: 12px;
  }
  .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }

  .brand-text { display: flex; flex-direction: column; min-width: 0; }
  .brand-name { font-size: 1.3rem; font-weight: 900; color: var(--text); letter-spacing: -0.5px; }
  .accent { color: var(--accent); }
  .brand-tag { font-size: 0.65rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .nav-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .install-icon-btn {
    background: var(--tab-bg); border: 1px solid var(--tab-border); border-radius: 50%;
    width: 38px; height: 38px; font-size: 1.1rem;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .install-icon-btn:hover { border-color: var(--accent); background: var(--bg-elevated); }

  .source-nav-btn {
    background: var(--tab-bg); border: 1px solid var(--tab-border); border-radius: 50%;
    width: 38px; height: 38px; font-size: 1.1rem;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .source-nav-btn:hover { border-color: var(--accent); background: var(--bg-elevated); }

  .theme-btn {
    background: var(--tab-bg); border: 1px solid var(--tab-border); border-radius: 50%;
    width: 38px; height: 38px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--tab-text); flex-shrink: 0;
    transition: all 0.2s;
  }
  .theme-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--bg-elevated); }

  .lang-toggle {
    background: var(--tab-bg); border: 1px solid var(--tab-border); border-radius: 50%;
    width: 38px; height: 38px; font-size: 1.2rem;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center;
  }
  .lang-toggle:hover, .lang-toggle.active { border-color: var(--accent); background: var(--bg-elevated); }

  .search-row { padding: 0 16px 8px; }
  .search-wrap { position: relative; }
  .search-input {
    width: 100%; background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: 12px; color: var(--text);
    padding: 12px 44px 12px 16px;
    font-size: 1rem; outline: none; transition: border-color 0.2s;
    -webkit-appearance: none;
  }
  .search-input:focus { border-color: var(--accent); }
  .search-icon { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); opacity: 0.4; pointer-events: none; font-size: 1.1rem; }

  /* Category tabs - scrollable horizontal */
  .category-tabs {
    display: flex; gap: 8px; overflow-x: auto; padding: 0 16px;
    scrollbar-width: none; -ms-overflow-style: none;
  }
  .category-tabs::-webkit-scrollbar { display: none; }
  .tab {
    background: transparent; border: 1px solid var(--tab-border); border-radius: 20px;
    color: var(--tab-text); padding: 6px 12px; font-size: 0.82rem; font-weight: 600;
    cursor: pointer; transition: all 0.2s; white-space: nowrap; flex-shrink: 0;
    font-family: inherit;
  }
  .tab:hover { border-color: var(--accent); color: var(--text); }
  .tab.active { background: var(--tab-active-bg); border-color: var(--tab-active-bg); color: var(--tab-active-text); }

  /* Smaller tabs on narrow phones */
  @media (max-width: 480px) {
    .tab { padding: 5px 10px; font-size: 0.75rem; }
    .category-tabs { gap: 5px; padding: 0 12px; }
  }

  /* Main feed */
  .main { flex: 1; padding: 16px; max-width: 680px; margin: 0 auto; width: 100%; }

  .translate-bar {
    display: flex; align-items: center; gap: 10px;
    background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 16px; margin-bottom: 16px; font-size: 0.9rem; color: var(--text-muted);
  }
  .mini-spinner {
    width: 16px; height: 16px; border: 2px solid var(--border);
    border-top-color: var(--accent); border-radius: 50%;
    animation: spin 0.7s linear infinite; flex-shrink: 0;
  }

  .feed { display: flex; flex-direction: column; gap: 12px; }

  /* States */
  .state-center {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 60vh; gap: 14px; text-align: center; padding: 24px;
  }
  .error-icon { font-size: 3rem; }
  .error-title { font-size: 1rem; color: var(--text); line-height: 1.5; max-width: 280px; }
  .error-sub { font-size: 0.85rem; color: var(--text-muted); max-width: 260px; line-height: 1.5; }
  .refresh-btn {
    background: var(--accent); color: #fff; border: none; border-radius: 12px;
    padding: 14px 32px; cursor: pointer; font-size: 1rem; font-weight: 700;
    font-family: inherit; margin-top: 8px;
  }
  .refresh-btn:active { background: var(--accent-hover); }

  .spinner {
    width: 44px; height: 44px; border: 3px solid var(--border);
    border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .footer { text-align: center; padding: 24px 16px; border-top: 1px solid var(--footer-border); color: var(--text-muted); font-size: 0.8rem; }
  .footer a { color: var(--accent); text-decoration: none; }

  /* iOS install guide */
  .ios-guide {
    position: fixed; inset: 0; background: var(--overlay-bg);
    z-index: 999; display: flex; align-items: flex-end; justify-content: center;
    padding: 16px;
  }
  .ios-guide-box {
    background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 20px;
    padding: 24px 20px; width: 100%; max-width: 400px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .ios-guide-title { font-size: 1.1rem; font-weight: 800; color: var(--text); text-align: center; }
  .ios-guide-step { font-size: 0.95rem; color: var(--text-secondary); line-height: 1.5; }
  .ios-close {
    background: var(--tab-bg); border: 1px solid var(--border); border-radius: 12px;
    color: var(--text-muted); padding: 12px; font-size: 0.9rem; cursor: pointer;
    font-family: inherit; margin-top: 4px;
  }

  /* Source Selection Panel */
  .source-overlay {
    position: fixed; inset: 0; background: var(--overlay-bg);
    z-index: 999; display: flex; align-items: flex-end; justify-content: center;
    padding: 16px;
  }
  .source-panel {
    background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 20px;
    padding: 20px; width: 100%; max-width: 400px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .source-panel-header h3 {
    font-size: 1.1rem; font-weight: 800; color: var(--text); margin: 0;
  }
  .source-panel-cat {
    font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; display: block;
  }
  .source-list {
    display: flex; flex-direction: column; gap: 8px;
    max-height: 50vh; overflow-y: auto;
  }
  .source-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: 10px;
    cursor: pointer; transition: background 0.2s;
  }
  .source-item:hover { background: var(--bg); }
  .source-item input[type="checkbox"] {
    width: 20px; height: 20px; accent-color: var(--accent); flex-shrink: 0;
    cursor: pointer;
  }
  .source-name { font-size: 0.95rem; color: var(--text); font-weight: 600; }
  .source-panel-actions {
    display: flex; gap: 10px; margin-top: 4px;
  }
  .source-cancel {
    flex: 1; background: transparent; border: 1px solid var(--border); border-radius: 12px;
    color: var(--text-muted); padding: 12px; font-size: 0.9rem; font-weight: 700;
    cursor: pointer; font-family: inherit;
  }
  .source-apply {
    flex: 1; background: var(--accent); border: none; border-radius: 12px;
    color: #fff; padding: 12px; font-size: 0.9rem; font-weight: 700;
    cursor: pointer; font-family: inherit;
  }
  .source-apply:active { background: var(--accent-hover); }

  /* Desktop: wider cards */
  @media (min-width: 700px) {
    .main { padding: 24px 20px; }
    .nav-top { padding: 16px 24px 10px; }
    .search-row { padding: 0 24px 10px; }
    .category-tabs { padding: 0 24px; }
  }
</style>
