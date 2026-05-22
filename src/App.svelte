<script>
  import { onMount } from 'svelte';
  import NewsCard from './lib/NewsCard.svelte';
  import { fetchTopHeadlines, searchNews, translateToNepali } from './lib/api.js';

  const categories = [
    { id: 'trending',   en: 'Trending 🔥',      ne: 'ट्रेन्डिङ 🔥' },
    { id: 'nepal',      en: 'Nepal 🇳🇵',        ne: 'नेपाल 🇳🇵' },
    { id: 'usa',        en: 'USA 🇺🇸',          ne: 'अमेरिका 🇺🇸' },
    { id: 'world',      en: 'World 🌐',         ne: 'विश्व 🌐' },
    { id: 'finance',    en: 'Finance 💰',       ne: 'वित्त 💰' },
    { id: 'technology', en: 'Technology 💻',    ne: 'प्रविधि 💻' },
    { id: 'medical',    en: 'Health 🏥',        ne: 'स्वास्थ्य 🏥' },
    { id: 'gossip',     en: 'Gossip 🌟',        ne: 'गफसफ 🌟' },
  ];

  // UI strings in both languages
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

  let activeCategory = 'trending';
  let articles = [];
  let loading = false;
  let error = '';
  let isProxyError = false;
  let searchQuery = '';
  let searchTimeout;
  let nepali = true; // DEFAULT: Nepali
  let translations = {};
  let translatingCount = 0;
  let deferredInstall = null;
  let showInstall = false;
  let isIOS = false;
  let showIOSGuide = false;

  if (typeof window !== 'undefined') {
    isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    // Show install button: on iOS always (unless already standalone), on others wait for prompt
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

  async function translateArticle(article) {
    if (translations[article.url]) return;
    translatingCount += 1;
    const key = article.url;
    const [title, description] = await Promise.all([
      translateToNepali(article.title),
      article.description ? translateToNepali(article.description) : Promise.resolve(''),
    ]);
    translations = { ...translations, [key]: { title, description } }; // new ref = Svelte re-renders
    translatingCount = Math.max(0, translatingCount - 1);
  }

  function startTranslating(list) {
    for (const a of list) translateArticle(a);
  }

  async function loadNews(category) {
    loading = true;
    error = '';
    isProxyError = false;
    translations = {};
    translatingCount = 0;
    try {
      articles = await fetchTopHeadlines(category);
      if (nepali) startTranslating(articles);
    } catch (e) {
      error = e.message;
      isProxyError = e.message.startsWith('PROXY_FAILED') || e.message.includes('CORS') || e.message.includes('proxy');
      articles = [];
    }
    loading = false;
  }

  function setCategory(id) {
    activeCategory = id;
    searchQuery = '';
    loadNews(id);
  }

  function handleSearch() {
    clearTimeout(searchTimeout);
    if (!searchQuery.trim()) { loadNews(activeCategory); return; }
    searchTimeout = setTimeout(async () => {
      loading = true; error = ''; isProxyError = false; translations = {};
      try {
        articles = await searchNews(searchQuery.trim());
        if (nepali) startTranslating(articles);
      } catch (e) {
        error = e.message;
        isProxyError = e.message.startsWith('PROXY_FAILED');
        articles = [];
      }
      loading = false;
    }, 500);
  }

  function toggleNepali() {
    nepali = !nepali;
    if (nepali) startTranslating(articles);
  }

  function display(article) {
    if (!nepali) return article;
    const t = translations[article.url];
    if (!t) return article;
    return { ...article, title: t.title, description: t.description };
  }

  // Inline nepali+translations so Svelte tracks both as reactive deps
  $: displayedArticles = articles.map(a => {
    if (!nepali) return a;
    const tr = translations[a.url];
    if (!tr) return a;
    return { ...a, title: tr.title, description: tr.description };
  });

  // Wrap article URL with Google Translate when in Nepali mode
  function articleUrl(url) {
    if (!nepali) return url;
    return `https://translate.google.com/translate?sl=auto&tl=ne&u=${encodeURIComponent(url)}`;
  }

  $: t = nepali ? UI.ne : UI.en;

  onMount(() => loadNews('trending'));
</script>

<div class="app">
  <!-- Navbar -->
  <nav class="navbar">
    <div class="nav-top">
      <div class="brand">
        <span class="brand-icon">📰</span>
        <div class="brand-text">
          <span class="brand-name">{nepali ? 'स्वस्थ' : 'Healthy'}<span class="accent">{nepali ? ' विचार' : ' Thoughts'}</span></span>
          <span class="brand-tag">{t.tagline}</span>
        </div>
      </div>
      <div class="nav-actions">
        {#if showInstall}
          <button class="install-icon-btn" on:click={installApp} title={t.install}>📲</button>
        {/if}
        <button class="lang-toggle {nepali ? 'active' : ''}" on:click={toggleNepali}>
          {nepali ? '🇳🇵' : '🇺🇸'}
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

  <!-- Main -->
  <main class="main">
    {#if loading}
      <div class="state-center">
        <div class="spinner"></div>
        <p>{t.loading}</p>
      </div>

    {:else if error}
      <div class="state-center error">
        {#if isProxyError}
          <div class="error-icon">📡</div>
          <p class="error-title">{t.freeService}</p>
          <p class="error-sub">{t.refresh}</p>
        {:else}
          <div class="error-icon">⚠️</div>
          <p class="error-title">{error}</p>
          <p class="error-sub">{t.freeService}</p>
        {/if}
        <button class="refresh-btn" on:click={() => loadNews(activeCategory)}>
          🔄 {nepali ? 'रिफ्रेस' : 'Refresh'}
        </button>
      </div>

    {:else if articles.length === 0}
      <div class="state-center">
        <div class="error-icon">🔍</div>
        <p class="error-title">{t.noArticles}</p>
        <p class="error-sub">{t.freeService}</p>
        <button class="refresh-btn" on:click={() => loadNews(activeCategory)}>
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
        {#each displayedArticles as article (article.url)}
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
    <p>© 2026 BirajNews · <a href="https://newsapi.org" target="_blank">NewsAPI</a></p>
  </footer>
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html) { font-size: 16px; }
  :global(body) {
    background: #060d14;
    color: #c8d6e5;
    font-family: 'Noto Sans Devanagari', 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  :global(a) { color: inherit; }

  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* Navbar */
  .navbar {
    position: sticky; top: 0; z-index: 100;
    background: rgba(6, 13, 20, 0.97);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid #1a2a3a;
    padding-bottom: 8px;
  }
  .nav-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px 8px;
    gap: 12px;
  }
  .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .brand-icon { font-size: 1.8rem; flex-shrink: 0; }
  .brand-text { display: flex; flex-direction: column; min-width: 0; }
  .brand-name { font-size: 1.3rem; font-weight: 900; color: #e8edf2; letter-spacing: -0.5px; }
  .accent { color: #3a7bd5; }
  .brand-tag { font-size: 0.65rem; color: #4a6080; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .nav-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .install-btn {
    background: linear-gradient(135deg, #3a7bd5, #00d2ff);
    border: none; border-radius: 20px; color: #fff;
    padding: 7px 12px; font-size: 0.75rem; font-weight: 700;
    cursor: pointer; white-space: nowrap;
  }

  .install-icon-btn {
    background: #0f1923; border: 1px solid #1e2d3d; border-radius: 50%;
    width: 38px; height: 38px; font-size: 1.1rem;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s; flex-shrink: 0;
  }
  .install-icon-btn:hover { border-color: #3a7bd5; background: #1a2a3a; }

  .lang-toggle {
    background: #0f1923; border: 1px solid #1e2d3d; border-radius: 50%;
    width: 38px; height: 38px; font-size: 1.2rem;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center;
  }
  .lang-toggle:hover, .lang-toggle.active { border-color: #3a7bd5; background: #1a2a3a; }

  .search-row { padding: 0 16px 8px; }
  .search-wrap { position: relative; }
  .search-input {
    width: 100%; background: #0f1923; border: 1px solid #1e2d3d;
    border-radius: 12px; color: #c8d6e5;
    padding: 12px 44px 12px 16px;
    font-size: 1rem; outline: none; transition: border-color 0.2s;
    -webkit-appearance: none;
  }
  .search-input:focus { border-color: #3a7bd5; }
  .search-icon { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); opacity: 0.4; pointer-events: none; font-size: 1.1rem; }

  /* Category tabs - scrollable horizontal */
  .category-tabs {
    display: flex; gap: 8px; overflow-x: auto; padding: 0 16px;
    scrollbar-width: none; -ms-overflow-style: none;
  }
  .category-tabs::-webkit-scrollbar { display: none; }
  .tab {
    background: transparent; border: 1px solid #1e2d3d; border-radius: 20px;
    color: #7a8fa8; padding: 8px 16px; font-size: 0.9rem; font-weight: 600;
    cursor: pointer; transition: all 0.2s; white-space: nowrap; flex-shrink: 0;
    font-family: inherit;
  }
  .tab:hover { border-color: #3a7bd5; color: #c8d6e5; }
  .tab.active { background: #3a7bd5; border-color: #3a7bd5; color: #fff; }

  /* Main feed */
  .main { flex: 1; padding: 16px; max-width: 680px; margin: 0 auto; width: 100%; }

  .translate-bar {
    display: flex; align-items: center; gap: 10px;
    background: #0f1923; border: 1px solid #1e2d3d; border-radius: 10px;
    padding: 10px 16px; margin-bottom: 16px; font-size: 0.9rem; color: #7a8fa8;
  }
  .mini-spinner {
    width: 16px; height: 16px; border: 2px solid #1e2d3d;
    border-top-color: #3a7bd5; border-radius: 50%;
    animation: spin 0.7s linear infinite; flex-shrink: 0;
  }

  .feed { display: flex; flex-direction: column; gap: 12px; }

  /* States */
  .state-center {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 60vh; gap: 14px; text-align: center; padding: 24px;
  }
  .error-icon { font-size: 3rem; }
  .error-title { font-size: 1rem; color: #c8d6e5; line-height: 1.5; max-width: 280px; }
  .error-sub { font-size: 0.85rem; color: #4a6080; max-width: 260px; line-height: 1.5; }
  .refresh-btn {
    background: #3a7bd5; color: #fff; border: none; border-radius: 12px;
    padding: 14px 32px; cursor: pointer; font-size: 1rem; font-weight: 700;
    font-family: inherit; margin-top: 8px;
  }
  .refresh-btn:active { background: #2d6bc4; }

  .spinner {
    width: 44px; height: 44px; border: 3px solid #1e2d3d;
    border-top-color: #3a7bd5; border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .footer { text-align: center; padding: 24px 16px; border-top: 1px solid #1a2a3a; color: #2a3a4a; font-size: 0.8rem; }
  .footer a { color: #3a7bd5; text-decoration: none; }

  /* iOS install guide */
  .ios-guide {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    z-index: 999; display: flex; align-items: flex-end; justify-content: center;
    padding: 16px;
  }
  .ios-guide-box {
    background: #0d1a27; border: 1px solid #1e2d3d; border-radius: 20px;
    padding: 24px 20px; width: 100%; max-width: 400px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .ios-guide-title { font-size: 1.1rem; font-weight: 800; color: #e8edf2; text-align: center; }
  .ios-guide-step { font-size: 0.95rem; color: #c8d6e5; line-height: 1.5; }
  .ios-close {
    background: #1a2a3a; border: 1px solid #2a3a4a; border-radius: 12px;
    color: #7a8fa8; padding: 12px; font-size: 0.9rem; cursor: pointer;
    font-family: inherit; margin-top: 4px;
  }

  /* Desktop: wider cards */
  @media (min-width: 700px) {
    .main { padding: 24px 20px; }
    .nav-top { padding: 16px 24px 10px; }
    .search-row { padding: 0 24px 10px; }
    .category-tabs { padding: 0 24px; }
  }
</style>
