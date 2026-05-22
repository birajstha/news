const API_KEY = 'e82c77585c5a4d0b95b9254535ddcac4';

async function fetchWithFallback(url) {
  const proxies = [
    {
      build: (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
      parse: async (res) => await res.json(),
    },
    {
      build: (u) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u),
      parse: async (res) => {
        const data = await res.json();
        return JSON.parse(data.contents);
      },
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
  throw new Error('All CORS proxies failed: ' + lastError?.message);
}

async function fetchNews(path) {
  const url = 'https://newsapi.org/v2/' + path + '&apiKey=' + API_KEY;
  const parsed = await fetchWithFallback(url);
  if (parsed.status !== 'ok') throw new Error(parsed.message || 'Failed to fetch news');
  return parsed.articles || [];
}

// Keyword categories that use /v2/everything
const KEYWORD_CATEGORIES = {
  neurotech: 'neurotechnology',
  brain: 'brain+neuroscience',
  'mental-health': 'mental+health',
  ai: 'artificial+intelligence',
};

export async function fetchTopHeadlines(category = '') {
  if (category && KEYWORD_CATEGORIES[category]) {
    const q = KEYWORD_CATEGORIES[category];
    return fetchNews(`top-headlines?q=${q}&country=us&pageSize=20`);
  }
  const cat = category && category !== 'all' ? `category=${category}&` : '';
  return fetchNews(`top-headlines?${cat}country=us&pageSize=20`);
}

export async function searchNews(query) {
  return fetchNews(`everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=20`);
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
