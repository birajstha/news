// ─── Multi-Source Free News Engine ───────────────────────────────────────────
// Sources: Hacker News API, RSS feeds via rss2json, NewsAPI fallback
// No paid keys required for HN + RSS. NewsAPI key used as bonus fallback.

const NEWSAPI_KEY = 'e82c77585c5a4d0b95b9254535ddcac4';
const RSS2JSON   = 'https://api.rss2json.com/v1/api.json?rss_url=';

// ─── CORS-safe fetch with 3-proxy fallback ────────────────────────────────────
async function proxiedFetch(url) {
  const strategies = [
    () => fetch('https://corsproxy.io/?' + encodeURIComponent(url)).then(r => r.json()),
    () => fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url))
            .then(r => r.json()).then(d => JSON.parse(d.contents)),
    () => fetch('https://thingproxy.freeboard.io/fetch/' + url).then(r => r.json()),
  ];
  let last;
  for (const fn of strategies) {
    try { return await fn(); } catch(e) { last = e; }
  }
  throw new Error('PROXY_FAILED: ' + last?.message);
}

// ─── Hacker News ──────────────────────────────────────────────────────────────
async function fetchHackerNews() {
  const ids = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json').then(r => r.json());
  const top30 = ids.slice(0, 30);
  const items = await Promise.allSettled(
    top30.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json()))
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

// ─── RSS via rss2json ─────────────────────────────────────────────────────────
async function fetchRSS(feedUrl) {
  const url = RSS2JSON + encodeURIComponent(feedUrl) + '&count=20';
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch {
    // fallback to proxy
    data = await proxiedFetch(url);
  }
  if (!data?.items?.length) return [];
  return data.items.map(item => ({
    title: item.title,
    description: item.description
      ? item.description.replace(/<[^>]+>/g, '').slice(0, 300)
      : '',
    url: item.link,
    urlToImage: item.thumbnail || item.enclosure?.link || null,
    publishedAt: item.pubDate,
    source: { name: data.feed?.title || feedUrl },
  }));
}

// ─── NewsAPI fallback ─────────────────────────────────────────────────────────
async function fetchNewsAPI(path) {
  const url = 'https://newsapi.org/v2/' + path + '&apiKey=' + NEWSAPI_KEY;
  const data = await proxiedFetch(url);
  if (data.status !== 'ok') return [];
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

// ─── RSS FEED REGISTRY ────────────────────────────────────────────────────────
const FEEDS = {
  // USA news
  usa: [
    'https://feeds.npr.org/1001/rss.xml',
    'http://feeds.washingtonpost.com/rss/politics',
    'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    'https://feeds.politico.com/politico/rss/politicopicks',
    'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  ],
  // Nepal news
  nepal: [
    'https://thehimalayantimes.com/feed/',
    'https://kathmandupost.com/rss',
    'https://myrepublica.nagariknetwork.com/feed/',
    'https://english.onlinekhabar.com/feed',
    'https://risingnepaldaily.com/feed',
  ],
  // World
  world: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://feeds.reuters.com/reuters/topNews',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://feeds.skynews.com/feeds/rss/world.xml',
  ],
  // Tech (mix of RSS + Hacker News handled separately)
  technology: [
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://www.wired.com/feed/rss',
    'https://feeds.feedburner.com/venturebeat/SZYF',
  ],
  // Health / Medical
  medical: [
    'https://feeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC',
    'https://www.medicalnewstoday.com/rss',
    'https://feeds.npr.org/1128/rss.xml',       // NPR Health
    'https://feeds.bbci.co.uk/news/health/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
  ],
  // Trending — broad mix
  trending: [
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://feeds.reuters.com/reuters/topNews',
  ],
  // Finance / stocks / money
  finance: [
    'https://feeds.bloomberg.com/markets/news.rss',
    'https://www.cnbc.com/id/10000664/device/rss/rss.html',
    'https://feeds.marketwatch.com/marketwatch/topstories/',
    'https://www.investing.com/rss/news_301.rss',
    'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^DJI,^IXIC&region=US&lang=en-US',
  ],
  // Gossip / entertainment / celebrity — opt-in tab
  gossip: [
    'https://www.tmz.com/rss.xml',
    'https://people.com/feed/',
    'https://www.eonline.com/syndication/feeds/rssfeeds/topstories.xml',
    'https://pagesix.com/feed/',
    'https://www.usmagazine.com/feed/',
  ],
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────
export async function fetchTopHeadlines(category) {
  const feedUrls = FEEDS[category] || FEEDS.usa;

  let results;

  if (category === 'technology') {
    // Tech: HN + RSS in parallel
    const [hn, ...rssResults] = await Promise.allSettled([
      fetchHackerNews(),
      ...feedUrls.map(fetchRSS),
    ]);
    const hnArticles = hn.status === 'fulfilled' ? hn.value : [];
    const rssArticles = rssResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    results = [...hnArticles.slice(0, 10), ...rssArticles];
  } else {
    // Other: try RSS feeds in parallel, fallback to NewsAPI
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

  return clean(results).slice(0, 40);
}

export async function searchNews(query) {
  // Search: try NewsAPI everything endpoint, fallback to filtered trending RSS
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
    const res = await fetch(url);
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
