<script>
  import { timeAgo } from './api.js';
  export let article;

  const fallback = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&q=80';
  let imgSrc = article.urlToImage || fallback;
</script>

<article class="card">
  <a href={article.url} target="_blank" rel="noopener noreferrer" class="card-image-link">
    <div class="card-image">
      <img src={imgSrc} alt={article.title} on:error={() => imgSrc = fallback} loading="lazy" />
      {#if article.source?.name}
        <span class="source-badge">{article.source.name}</span>
      {/if}
    </div>
  </a>
  <div class="card-body">
    <h3 class="card-title">
      <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a>
    </h3>
    {#if article.description}
      <p class="card-desc">{article.description}</p>
    {/if}
    <div class="card-footer">
      <span class="time">{timeAgo(article.publishedAt)}</span>
      <a href={article.url} target="_blank" rel="noopener noreferrer" class="read-more">
        Read More →
      </a>
    </div>
  </div>
</article>

<style>
  .card {
    background: #0f1923;
    border: 1px solid #1e2d3d;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
  }
  .card:hover {
    transform: translateY(-4px);
    border-color: #3a7bd5;
    box-shadow: 0 8px 32px rgba(58, 123, 213, 0.2);
  }
  .card-image-link { display: block; }
  .card-image {
    position: relative;
    aspect-ratio: 16/9;
    overflow: hidden;
    background: #0a1520;
  }
  .card-image img {
    width: 100%; height: 100%;
    object-fit: cover;
    transition: transform 0.3s;
  }
  .card:hover .card-image img { transform: scale(1.05); }
  .source-badge {
    position: absolute;
    top: 10px; left: 10px;
    background: rgba(58, 123, 213, 0.9);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .card-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 8px;
  }
  .card-title { margin: 0; font-size: 0.95rem; line-height: 1.4; }
  .card-title a {
    color: #e8edf2;
    text-decoration: none;
    transition: color 0.2s;
  }
  .card-title a:hover { color: #4d9fff; }
  .card-desc {
    margin: 0;
    font-size: 0.82rem;
    color: #7a8fa8;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid #1e2d3d;
  }
  .time { font-size: 0.75rem; color: #4a6080; }
  .read-more {
    font-size: 0.78rem;
    color: #3a7bd5;
    text-decoration: none;
    font-weight: 600;
    transition: color 0.2s;
  }
  .read-more:hover { color: #4d9fff; }
</style>
