const API_KEY = 'e82c77585c5a4d0b95b9254535ddcac4';

async function fetchWithFallback(url) {
  const proxies = [
    {
      build: (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
      parse: async (res) => await res.json(),
    },
    {
      build: (u) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u),
      parse: async (res) => { const d = await res.json(); return JSON.parse(d.contents); },
    },
    {
      build: (u) => 'https://thingproxy.freeboard.io/fetch/' + u,
      parse: async (res) => await res.json(),
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
    a.title && a.title !== '[Removed]' &&
    !isCelebrity(a.title + ' ' + (a.description || ''))
  );
}

// Filter out celebrity/gossip/clickbait
function isCelebrity(text) {
  const t = text.toLowerCase();
  const noise = ['celebrity','kardashian','taylor swift','beyonce','justin bieber',
    'selena gomez','outfit','dating rumor','breakup','pregnancy','baby shower',
    'red carpet','met gala','bachelor','reality tv','tiktok dance','viral video',
    'instagram','influencer','gossip','feud','drama'];
  return noise.some(w => t.includes(w));
}

// Google Translate free endpoint
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

// Category definitions
const CATEGORIES = {
  'usa':         { q: 'USA politics economy', country: 'us' },
  'nepal':       { q: 'Nepal', country: 'us', lang: 'en' },
  'world':       { q: 'international world', country: 'us' },
  'technology':  { q: 'technology', country: 'us' },
  'medical':     { q: 'health medicine science', country: 'us' },
  'trending':    { q: 'breaking trending', country: 'us' },
};

export async function fetchTopHeadlines(category = 'usa') {
  const cfg = CATEGORIES[category] || CATEGORIES['usa'];
  return fetchNews(`top-headlines?q=${encodeURIComponent(cfg.q)}&country=${cfg.country}&pageSize=30`);
}

export async function searchNews(query) {
  return fetchNews(`everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=20`);
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
