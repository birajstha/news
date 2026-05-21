const API_KEY='e82c77...cac4';
const CORS_PROXY = 'https://api.allorigins.win/get?url=';

function buildUrl(path) {
  return CORS_PROXY + encodeURIComponent('https://newsapi.org/v2/' + path + '&apiKey=' + API_KEY);
}

async function fetchNews(path) {
  const res = await fetch(buildUrl(path));
  const data = await res.json();
  const parsed = JSON.parse(data.contents);
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
    return fetchNews(`everything?q=${q}&sortBy=publishedAt&pageSize=20`);
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
