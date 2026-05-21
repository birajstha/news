<script>
  import { onMount } from 'svelte';
  import NewsCard from './lib/NewsCard.svelte';
  import { fetchTopHeadlines, searchNews } from './lib/api.js';

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'technology', label: 'Technology' },
    { id: 'ai', label: 'AI' },
    { id: 'science', label: 'Science' },
    { id: 'business', label: 'Business' },
    { id: 'sports', label: 'Sports' },
  ];

  let activeCategory = 'all';
  let articles = [];
  let loading = false;
  let error = '';
  let searchQuery = '';
  let searchTimeout;

  async function loadNews(category) {
    loading = true;
    error = '';
    try {
      articles = await fetchTopHeadlines(category);
    } catch (e) {
      error = e.message;
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
    if (!searchQuery.trim()) {
      loadNews(activeCategory);
      return;
    }
    searchTimeout = setTimeout(async () => {
      loading = true;
      error = '';
      try {
        articles = await searchNews(searchQuery.trim());
      } catch (e) {
        error = e.message;
        articles = [];
      }
      loading = false;
    }, 500);
  }

  onMount(() => loadNews('all'));
</script>

<div class="app">
  <!-- Navbar -->
  <nav class="navbar">
    <div class="nav-inner">
      <div class="brand">
        <span class="brand-icon">📰</span>
        <span class="brand-name">BJ <span class="accent">News</span></span>
      </div>
      <div class="search-wrap">
        <input
          type="text"
          class="search-input"
          placeholder="Search news..."
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
        >{cat.label}</button>
      {/each}
    </div>
  </nav>

  <!-- Hero -->
  <header class="hero">
    <h1 class="hero-title">
      Stay <span class="gradient-text">Informed</span>,<br />Stay <span class="gradient-text">Ahead</span>
    </h1>
    <p class="hero-sub">Breaking news, trending stories, and in-depth coverage — all in one place.</p>
  </header>

  <!-- Main -->
  <main class="main">
    {#if loading}
      <div class="state-center">
        <div class="spinner"></div>
        <p>Loading latest news…</p>
      </div>
    {:else if error}
      <div class="state-center error">
        <p>⚠️ {error}</p>
        <button on:click={() => loadNews(activeCategory)}>Retry</button>
      </div>
    {:else if articles.length === 0}
      <div class="state-center">
        <p>No articles found.</p>
      </div>
    {:else}
      <div class="grid">
        {#each articles.filter(a => a.title && a.title !== '[Removed]') as article (article.url)}
          <NewsCard {article} />
        {/each}
      </div>
    {/if}
  </main>

  <!-- Footer -->
  <footer class="footer">
    <p>© 2026 BJ News &nbsp;·&nbsp; Powered by <a href="https://newsapi.org" target="_blank">NewsAPI</a></p>
  </footer>
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) { background: #060d14; color: #c8d6e5; font-family: 'Inter', system-ui, sans-serif; }

  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* Navbar */
  .navbar {
    position: sticky; top: 0; z-index: 100;
    background: rgba(6, 13, 20, 0.95);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid #1a2a3a;
  }
  .nav-inner {
    max-width: 1200px; margin: 0 auto;
    padding: 14px 20px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-icon { font-size: 1.5rem; }
  .brand-name { font-size: 1.4rem; font-weight: 800; color: #e8edf2; letter-spacing: -0.5px; }
  .accent { color: #3a7bd5; }

  .search-wrap { position: relative; flex: 1; max-width: 360px; }
  .search-input {
    width: 100%;
    background: #0f1923;
    border: 1px solid #1e2d3d;
    border-radius: 8px;
    color: #c8d6e5;
    padding: 9px 36px 9px 14px;
    font-size: 0.88rem;
    outline: none;
    transition: border-color 0.2s;
  }
  .search-input:focus { border-color: #3a7bd5; }
  .search-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); opacity: 0.5; pointer-events: none; }

  .category-tabs {
    max-width: 1200px; margin: 0 auto;
    padding: 0 20px 10px;
    display: flex; gap: 6px; flex-wrap: wrap;
  }
  .tab {
    background: transparent;
    border: 1px solid #1e2d3d;
    border-radius: 20px;
    color: #7a8fa8;
    padding: 6px 16px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  .tab:hover { border-color: #3a7bd5; color: #c8d6e5; }
  .tab.active { background: #3a7bd5; border-color: #3a7bd5; color: #fff; font-weight: 600; }

  /* Hero */
  .hero {
    text-align: center;
    padding: 60px 20px 40px;
    background: radial-gradient(ellipse at 50% 0%, rgba(58, 123, 213, 0.12) 0%, transparent 70%);
  }
  .hero-title { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 900; line-height: 1.15; color: #e8edf2; margin-bottom: 14px; }
  .gradient-text {
    background: linear-gradient(135deg, #3a7bd5 0%, #00d2ff 50%, #a855f7 100%);
    background-size: 200% 200%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: gradShift 4s ease infinite;
  }
  @keyframes gradShift {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
  .hero-sub { color: #7a8fa8; font-size: 1rem; max-width: 500px; margin: 0 auto; }

  /* Main */
  .main { flex: 1; max-width: 1200px; margin: 0 auto; width: 100%; padding: 24px 20px 48px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }

  .state-center {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 300px; gap: 16px; color: #4a6080;
  }
  .state-center.error { color: #f56565; }
  .state-center button {
    background: #3a7bd5; color: #fff; border: none; border-radius: 8px;
    padding: 10px 24px; cursor: pointer; font-size: 0.9rem;
  }
  .spinner {
    width: 40px; height: 40px;
    border: 3px solid #1e2d3d;
    border-top-color: #3a7bd5;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Footer */
  .footer {
    text-align: center;
    padding: 24px;
    border-top: 1px solid #1a2a3a;
    color: #4a6080;
    font-size: 0.82rem;
  }
  .footer a { color: #3a7bd5; text-decoration: none; }
  .footer a:hover { text-decoration: underline; }
</style>
