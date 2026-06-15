// ─── Multi-Source Free News Engine ───────────────────────────────────────────
// Sources: Hacker News API, RSS feeds via CF Pages proxy, NewsAPI via CF server-side
// NewsAPI key is a Cloudflare secret — never exposed to the browser.

// ─── In-memory cache to avoid re-fetching within the same session ─────────────
const _cache = new Map(); // key → { articles, ts }
const CACHE_TTL = 0; // Edge cache (CF Worker) handles all caching — no browser-side cache

function getCached(key) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.articles;
  return null;
}
function setCache(key, articles) {
  _cache.set(key, { articles, ts: Date.now() });
}

// ─── Fetch raw XML — CF Pages proxy first (edge-cached, fast), then fallbacks ─
async function fetchRawXML(url) {
  // 1. Own CF Pages Function — same origin, no CORS, 5-min edge cache
  try {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const xml = await res.text();
      if (xml && xml.includes('<item')) return xml;
    }
  } catch { /* fall through */ }

  // 2. allorigins.win fallback
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const xml = data?.contents;
      if (xml && xml.includes('<item')) return xml;
    }
  } catch { /* fall through */ }

  // 3. corsproxy.io fallback
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const xml = await res.text();
      if (xml && xml.includes('<item')) return xml;
    }
  } catch { /* fall through */ }

  return null;
}

function parseRSSXML(xml, feedUrl) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const channelTitle = doc.querySelector('channel > title')?.textContent || feedUrl;
    const items = [...doc.querySelectorAll('item')];
    return items.slice(0, 20).map(item => {
      const enc = item.querySelector('enclosure');
      const mediaThumbs = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'thumbnail');
      const img = enc?.getAttribute('url') || mediaThumbs[0]?.getAttribute('url') || null;
      return {
        title: item.querySelector('title')?.textContent?.trim() || '',
        description: (item.querySelector('description')?.textContent || '')
          .replace(/<[^>]+>/g, '').slice(0, 300),
        url: item.querySelector('link')?.textContent?.trim() ||
             item.querySelector('guid')?.textContent?.trim() || '#',
        urlToImage: img,
        publishedAt: item.querySelector('pubDate')?.textContent || new Date().toISOString(),
        source: { name: channelTitle },
      };
    }).filter(a => a.title && a.url !== '#');
  } catch { return []; }
}

// ─── Hacker News ──────────────────────────────────────────────────────────────
async function fetchHackerNews() {
  const ids = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
    signal: AbortSignal.timeout(8000),
  }).then(r => r.json());
  const top20 = ids.slice(0, 20);
  const items = await Promise.allSettled(
    top20.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
      signal: AbortSignal.timeout(5000),
    }).then(r => r.json()))
  );
  return items
    .filter(r => r.status === 'fulfilled' && r.value?.title && r.value?.url)
    .map(r => r.value)
    .map(item => ({
      title: item.title,
      description: `🔺 ${item.score} points · ${item.descendants || 0} comments on Hacker News`,
      url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      urlToImage: null,
      publishedAt: new Date(item.time * 1000).toISOString(),
      source: { name: 'Hacker News' },
    }));
}

// ─── RSS: fetch raw XML, parse client-side ────────────────────────────────────
async function fetchRSS(feedUrl) {
  const xml = await fetchRawXML(feedUrl);
  if (!xml) return [];
  return parseRSSXML(xml, feedUrl);
}

// ─── NewsAPI — calls our secure CF Pages Function (key never in browser) ──────
async function fetchNewsAPI(path) {
  const res = await fetch(`/api/news?path=${encodeURIComponent(path)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`NewsAPI proxy error: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(data.message || 'NewsAPI error');
  return (data.articles || []).map(a => ({ ...a, source: { name: a.source?.name || 'NewsAPI' } }));
}

// ─── Celebrity/gossip filter ──────────────────────────────────────────────────
const NOISE = ['kardashian','taylor swift','beyonce','justin bieber','love island',
  'bachelor','bachelorette','tiktok dance','gossip','celebrity feud','baby shower',
  'met gala','red carpet','reality show','influencer drama','breakup rumor',
  'selena gomez','ariana grande','drake beef','nicki minaj','cardi b'];
function isNoise(a) {
  const t = ((a.title||'') + ' ' + (a.description||'')).toLowerCase();
  return NOISE.some(w => t.includes(w));
}

function clean(articles) {
  return articles
    .filter(a => a.title && a.title !== '[Removed]' && !isNoise(a))
    .reduce((acc, a) => {
      if (!acc.find(x => x.title === a.title)) acc.push(a);
      return acc;
    }, []); // deduplicate
}

// ─── RSS FEED REGISTRY (named sources for per-source toggling) ────────────────
const FEEDS = {
  usa: [
    { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
    { name: 'Washington Post', url: 'http://feeds.washingtonpost.com/rss/politics' },
    { name: 'NYT', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
    { name: 'Politico', url: 'https://feeds.politico.com/politico/rss/politicopicks' },
    { name: 'WSJ', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
  ],
  nepal: [
    { name: 'Himalayan Times', url: 'https://thehimalayantimes.com/feed/' },
    { name: 'Kathmandu Post', url: 'https://kathmandupost.com/rss' },
    { name: 'My Republica', url: 'https://myrepublica.nagariknetwork.com/feed/' },
    { name: 'Online Khabar', url: 'https://english.onlinekhabar.com/feed' },
    { name: 'Rising Nepal', url: 'https://risingnepaldaily.com/feed' },
  ],
  world: [
    { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' },
    { name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all' },
    { name: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/world.xml' },
  ],
  technology: [
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
    { name: 'VentureBeat', url: 'https://feeds.feedburner.com/venturebeat/SZYF' },
  ],
  medical: [
    { name: 'WebMD', url: 'https://feeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC' },
    { name: 'Medical News Today', url: 'https://www.medicalnewstoday.com/rss' },
    { name: 'NPR Health', url: 'https://feeds.npr.org/1128/rss.xml' },
    { name: 'BBC Health', url: 'https://feeds.bbci.co.uk/news/health/rss.xml' },
    { name: 'NYT Health', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml' },
  ],
  trending: [
    { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
    { name: 'NYT', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
    { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
    { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' },
  ],
  finance: [
    { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss' },
    { name: 'CNBC', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
    { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
    { name: 'Investing.com', url: 'https://www.investing.com/rss/news_301.rss' },
    { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^DJI,^IXIC&region=US&lang=en-US' },
  ],
  gossip: [
    { name: 'TMZ', url: 'https://www.tmz.com/rss.xml' },
    { name: 'People', url: 'https://people.com/feed/' },
    { name: 'E! Online', url: 'https://www.eonline.com/syndication/feeds/rssfeeds/topstories.xml' },
    { name: 'Page Six', url: 'https://pagesix.com/feed/' },
    { name: 'US Weekly', url: 'https://www.usmagazine.com/feed/' },
  ],
  science: [
    { name: 'Nature', url: 'https://feeds.nature.com/nature/rss/current' },
    { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml' },
    { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home' },
    { name: 'Scientific American', url: 'https://rss.sciam.com/ScientificAmerican-Global' },
    { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
  ],
  sports: [
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news' },
    { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
    { name: 'Sky Sports', url: 'https://feeds.skynews.com/feeds/rss/sports.xml' },
    { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/' },
    { name: 'The Athletic', url: 'https://theathletic.com/feed/' },
  ],
  ai: [
    { name: 'MIT AI', url: 'https://news.mit.edu/topic/mitartificial-intelligence2/rss' },
    { name: 'Google AI', url: 'https://blog.research.google/feed/' },
    { name: 'OpenAI', url: 'https://openai.com/blog/feed.xml' },
    { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' },
    { name: 'DeepMind', url: 'https://deepmind.google/blog/feed.xml' },
  ],
};

// ─── Source preferences (localStorage-backed) ─────────────────────────────────
const STORAGE_KEY = 'healthy-thoughts-prefs';

function defaultPrefs() {
  const all = {};
  for (const [cat, sources] of Object.entries(FEEDS)) {
    all[cat] = sources.map(s => s.name); // all enabled by default
  }
  return { sources: all, nepali: true };
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults so new categories get all sources enabled
      const defaults = defaultPrefs();
      for (const cat of Object.keys(defaults.sources)) {
        if (!parsed.sources[cat]) parsed.sources[cat] = defaults.sources[cat];
      }
      return parsed;
    }
  } catch { /* fall through */ }
  return defaultPrefs();
}

function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* no-op */ }
}

export function getEnabledSources(category) {
  const prefs = loadPrefs();
  return prefs.sources[category] || [];
}

export function setEnabledSources(category, names) {
  const prefs = loadPrefs();
  prefs.sources[category] = names;
  savePrefs(prefs);
}

export function getLanguagePref() {
  return loadPrefs().nepali;
}

export function setLanguagePref(nepali) {
  const prefs = loadPrefs();
  prefs.nepali = nepali;
  savePrefs(prefs);
}

export function getAllSources(category) {
  return FEEDS[category] || [];
}

// ─── STREAMING API — calls onBatch(articles) as each feed resolves ────────────
// This makes the UI show the first results in ~1-2s instead of waiting for all.
export async function streamTopHeadlines(category, onBatch) {
  const cached = getCached(category);
  if (cached) { onBatch(cached); return; }

  const allSources = FEEDS[category] || FEEDS.usa;
  const enabledNames = getEnabledSources(category);
  const feedSources = allSources.filter(s => enabledNames.includes(s.name));
  const feedUrls = feedSources.map(s => s.url);

  const allArticles = [];
  let emitted = new Set();

  function emit(newArticles) {
    const fresh = newArticles.filter(a => a.title && !emitted.has(a.title));
    if (!fresh.length) return;
    fresh.forEach(a => emitted.add(a.title));
    allArticles.push(...fresh);
    const sorted = clean([...allArticles]).slice(0, 40);
    onBatch(sorted);
  }

  if (category === 'technology') {
    const promises = [
      fetchHackerNews().then(articles => emit(articles)).catch(() => {}),
      ...feedUrls.map(url => fetchRSS(url).then(articles => emit(articles)).catch(() => {})),
    ];
    await Promise.allSettled(promises);
  } else {
    const promises = feedUrls.map(url =>
      fetchRSS(url).then(articles => emit(articles)).catch(() => {})
    );
    await Promise.allSettled(promises);

    if (allArticles.length < 5) {
      const apiPaths = {
        usa:      'top-headlines?sources=cnn,nbc-news,abc-news,cbs-news,fox-news&pageSize=30',
        nepal:    'everything?q=Nepal&sortBy=publishedAt&language=en&pageSize=30',
        world:    'top-headlines?sources=bbc-news,reuters,associated-press,al-jazeera-english&pageSize=30',
        medical:  'top-headlines?category=health&language=en&pageSize=30',
        trending: 'top-headlines?sources=cnn,bbc-news,reuters&pageSize=30',
        finance:  'top-headlines?category=business&language=en&pageSize=30',
        gossip:   'top-headlines?category=entertainment&language=en&pageSize=30',
      };
      try {
        const fallback = await fetchNewsAPI(apiPaths[category] || apiPaths.usa);
        emit(fallback);
      } catch { /* no-op */ }
    }
  }

  const final = clean([...allArticles]).slice(0, 40);
  setCache(category, final);
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────
export async function fetchTopHeadlines(category) {
  // Check in-memory cache first
  const cached = getCached(category);
  if (cached) return cached;

  const allSources = FEEDS[category] || FEEDS.usa;
  const enabledNames = getEnabledSources(category);
  const feedSources = allSources.filter(s => enabledNames.includes(s.name));
  const feedUrls = feedSources.map(s => s.url);

  let results;

  if (category === 'technology') {
    // Tech: HN + RSS in parallel — race to first results
    const [hn, ...rssResults] = await Promise.allSettled([
      fetchHackerNews(),
      ...feedUrls.map(fetchRSS),
    ]);
    const hnArticles = hn.status === 'fulfilled' ? hn.value : [];
    const rssArticles = rssResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    results = [...hnArticles.slice(0, 10), ...rssArticles];
  } else {
    // All feeds in parallel
    const settled = await Promise.allSettled(feedUrls.map(fetchRSS));
    const rssArticles = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    if (rssArticles.length < 5) {
      // RSS failed — try NewsAPI
      const apiPaths = {
        usa:      'top-headlines?sources=cnn,nbc-news,abc-news,cbs-news,fox-news&pageSize=30',
        nepal:    'everything?q=Nepal&sortBy=publishedAt&language=en&pageSize=30',
        world:    'top-headlines?sources=bbc-news,reuters,associated-press,al-jazeera-english&pageSize=30',
        medical:  'top-headlines?category=health&language=en&pageSize=30',
        trending: 'top-headlines?sources=cnn,bbc-news,reuters&pageSize=30',
        finance:  'top-headlines?category=business&language=en&pageSize=30',
        gossip:   'top-headlines?category=entertainment&language=en&pageSize=30',
      };
      try {
        results = await fetchNewsAPI(apiPaths[category] || apiPaths.usa);
      } catch { results = rssArticles; }
    } else {
      results = rssArticles;
    }
  }

  const final = clean(results).slice(0, 40);
  setCache(category, final);
  return final;
}

export async function searchNews(query) {
  try {
    return clean(await fetchNewsAPI(
      `everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&language=en&pageSize=20`
    ));
  } catch {
    const articles = await fetchRSS('https://feeds.bbci.co.uk/news/rss.xml');
    const q = query.toLowerCase();
    return clean(articles.filter(a =>
      (a.title + ' ' + a.description).toLowerCase().includes(q)
    ));
  }
}

// ─── Google Translate (free, no key) ─────────────────────────────────────────
export async function translateToNepali(text) {
  if (!text) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ne&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return data[0].map(d => d[0]).join('');
  } catch { return text; }
}

// ─── Time formatting ──────────────────────────────────────────────────────────
export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'भर्खरै';
  if (m < 60) return `${m} मिनेट अघि`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} घण्टा अघि`;
  return `${Math.floor(h / 24)} दिन अघि`;
}
