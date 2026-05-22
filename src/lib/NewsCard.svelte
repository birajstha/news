<script>
  import { timeAgo } from './api.js';
  export let article;
  export let translating = false;
  export let nepali = false;
  export let readMoreLabel = 'Read More';
  export let href = article.url;

  const fallback = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80';
  let imgSrc = article.urlToImage || fallback;
  let imgError = false;
</script>

<article class="card">
  {#if !imgError && imgSrc}
    <a href={href} target="_blank" rel="noopener noreferrer" class="card-img-link">
      <img
        src={imgSrc}
        alt=""
        class="card-img"
        on:error={() => { imgError = true; }}
        loading="lazy"
      />
      {#if article.source?.name}
        <span class="source-badge">{article.source.name}</span>
      {/if}
    </a>
  {/if}

  <div class="card-body">
    {#if article.source?.name && imgError}
      <span class="source-inline">{article.source.name}</span>
    {/if}

    <h2 class="headline">
      {#if translating}
        <span class="shimmer wide"></span>
        <span class="shimmer medium"></span>
      {:else}
        <a href={href} target="_blank" rel="noopener noreferrer">{article.title}</a>
      {/if}
    </h2>

    {#if translating}
      <div class="summary-shimmer">
        <span class="shimmer full"></span>
        <span class="shimmer full"></span>
        <span class="shimmer narrow"></span>
      </div>
    {:else if article.description}
      <p class="summary">{article.description}</p>
    {/if}

    <div class="card-footer">
      <span class="time">{timeAgo(article.publishedAt)}</span>
      <a href={href} target="_blank" rel="noopener noreferrer" class="read-btn">
        {readMoreLabel} →
      </a>
    </div>
  </div>
</article>

<style>
  .card {
    background: #0d1a27;
    border: 1px solid #1a2a3a;
    border-radius: 16px;
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .card:active { border-color: #3a7bd5; }

  /* Image */
  .card-img-link { display: block; position: relative; }
  .card-img {
    width: 100%; aspect-ratio: 16/9;
    object-fit: cover; display: block;
    background: #0a1520;
  }
  .source-badge {
    position: absolute; bottom: 10px; left: 10px;
    background: rgba(6,13,20,0.85);
    color: #7a8fa8; font-size: 0.72rem; font-weight: 700;
    padding: 3px 10px; border-radius: 20px;
    text-transform: uppercase; letter-spacing: 0.5px;
    backdrop-filter: blur(4px);
  }

  /* Body */
  .card-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .source-inline { font-size: 0.72rem; color: #4a6080; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }

  /* Headline — BIG and readable */
  .headline { margin: 0; font-size: 1.15rem; line-height: 1.45; font-weight: 700; }
  .headline a { color: #e8edf2; text-decoration: none; }
  .headline a:hover { color: #4d9fff; }

  /* Summary */
  .summary {
    font-size: 0.95rem; color: #8a9ab8; line-height: 1.6; margin: 0;
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
  }

  /* Footer */
  .card-footer {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 10px; border-top: 1px solid #1a2a3a; gap: 12px;
    flex-wrap: wrap;
  }
  .time { font-size: 0.8rem; color: #3a5070; }
  .read-btn {
    font-size: 0.88rem; color: #3a7bd5; font-weight: 700;
    text-decoration: none; padding: 6px 14px;
    background: rgba(58,123,213,0.1); border-radius: 8px;
    transition: background 0.2s;
  }
  .read-btn:hover, .read-btn:active { background: rgba(58,123,213,0.2); }

  /* Shimmer */
  .shimmer {
    display: block; height: 18px; border-radius: 6px; margin-bottom: 6px;
    background: linear-gradient(90deg, #1a2a3a 25%, #243447 50%, #1a2a3a 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }
  .summary-shimmer .shimmer { height: 14px; margin-bottom: 8px; }
  .shimmer.wide   { width: 95%; }
  .shimmer.medium { width: 72%; }
  .shimmer.full   { width: 100%; }
  .shimmer.narrow { width: 60%; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* Larger screens: side-by-side image */
  @media (min-width: 540px) {
    .card { display: flex; flex-direction: row; }
    .card-img-link { width: 200px; flex-shrink: 0; }
    .card-img { height: 100%; aspect-ratio: unset; min-height: 140px; }
    .card-body { flex: 1; padding: 18px; }
    .headline { font-size: 1.1rem; }
  }
</style>
