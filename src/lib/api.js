const API_KEY = 'e82c77585c5a4d0b95b9254535ddcac4';

async function fetchWithFallback(url) {
  const proxies = [
    {
      build: (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
      parse: async (res) => res.json(),
    },
    {
      build: (u) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u),
      parse: async (res) => { const d = await res.json(); return JSON.parse(d.contents); },
    },
    {
      build: (u) => 'https://thingproxy.freeboard.io/fetch/' + u,
      parse: async (res) => res.json(),
    },
  ];
  let lastError;
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy.build(url));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await proxy.parse(res);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error('PROXY_FAILED:' + lastError?.message);
}

async function fetchNews(path) {
  const url = 'https://newsapi.org/v2/' + path + '&apiKey=' + API_KEY;
  const parsed = await fetchWithFallback(url);
  if (parsed.status !== 'ok') throw new Error(parsed.message || 'Failed to fetch news');
  return (parsed.articles || []).filter(a =>
    a.title && a.title !== '[Removed]' && !isCelebrity(a)
  );
}

function isCelebrity(a) {
  const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
  const noise = ['kardashian','taylor swift','beyonce','justin bieber','selena gomez',
    'red carpet','met gala','bachelor','tiktok dance','gossip','feud','love island',
    'reality tv','influencer','breakup rumor','dating rumor','baby shower'];
  return noise.some(w => text.includes(w));
}

// Category → NewsAPI params
// Using sources= for reliable results (country+q combo returns very few)
const CATEGORIES = {
  usa:        'top-headlines?sources=cnn,fox-news,the-washington-post,politico,nbc-news,abc-news,cbs-news&pageSize=30',
  nepal:      'everything?q=Nepal&sortBy=publishedAt&language=en&pageSize=30',
  world:      'top-headlines?sources=bbc-news,reuters,associated-press,al-jazeera-english&pageSize=30',
  technology: 'top-headlines?sources=techcrunch,the-verge,ars-technica,wired&pageSize=30',
  medical:    'top-headlines?sources=medical-news-today&category=health&q=health+medicine+science&language=en&pageSize=30',
  trending:   'top-headlines?sources=cnn,bbc-news,the-washington-post,reuters,nbc-news&pageSize=30',
};

export async function fetchTopHeadlines(category) {
  const path = CATEGORIES[category] || CATEGORIES.usa;
  return fetchNews(path);
}

export async function searchNews(query) {
  return fetchNews(`everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&language=en&pageSize=20`);
}

export async function translateToNepali(text) {
  if (!text) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ne&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    return data[0].map(d => d[0]).join('');
  } catch {
    return text;
  }
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'भर्खरै';
  if (m < 60) return `${m} मिनेट अघि`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} घण्टा अघि`;
  const d = Math.floor(h / 24);
  return `${d} दिन अघि`;
}
