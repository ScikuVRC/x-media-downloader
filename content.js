(() => {
  'use strict';

  const { isTwimgUrl, isMp4Variant, bestMp4, originalImageUrl, mediaKey, canonicalTweetUrl, isGifCandidate, escapeHtml } = self.XMD;

  const MAX_MEDIA = 1500;
  const ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
  const MEDIA_TYPES = new Set(['photo', 'video', 'animated_gif']);

  // key -> item, in insertion order (oldest first) so the cache can be trimmed.
  const mediaStore = new Map();
  // tweetId -> Set of keys
  const mediaByTweet = new Map();
  const dirtyTweets = new Set();
  let toastTimer = 0;

  // Items arrive from the page via postMessage, which any script on x.com can send,
  // so everything is re-validated here rather than trusted.
  const normalizeItem = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const imageUrl = isTwimgUrl(raw.imageUrl) ? String(raw.imageUrl) : '';
    const previewUrl = isTwimgUrl(raw.previewUrl) ? String(raw.previewUrl) : imageUrl;
    const variants = (Array.isArray(raw.variants) ? raw.variants : [])
      .filter(v => v && isTwimgUrl(v.url))
      .map(v => ({ url: String(v.url), contentType: String(v.contentType || ''), bitrate: Number(v.bitrate || 0) }));
    if (!imageUrl && !previewUrl && !variants.length) return null;
    const tweetId = /^\d+$/.test(String(raw.tweetId || '')) ? String(raw.tweetId) : '';
    return {
      tweetId,
      tweetUrl: canonicalTweetUrl(raw.tweetUrl || ''),
      id: String(raw.id || '').slice(0, 120),
      type: MEDIA_TYPES.has(raw.type) ? raw.type : 'photo',
      imageUrl,
      previewUrl,
      width: Number(raw.width || 0),
      height: Number(raw.height || 0),
      durationMs: Number(raw.durationMs || 0),
      variants
    };
  };

  const indexItem = (key, item) => {
    if (!item.tweetId) return;
    if (!mediaByTweet.has(item.tweetId)) mediaByTweet.set(item.tweetId, new Set());
    mediaByTweet.get(item.tweetId).add(key);
  };

  const unindexItem = (key, item) => {
    const keys = mediaByTweet.get(item.tweetId);
    if (!keys) return;
    keys.delete(key);
    if (!keys.size) mediaByTweet.delete(item.tweetId);
  };

  // API items (with real ids and video variants) win over DOM-scraped ones.
  const isBetter = (next, current) =>
    (next.variants.length && !current.variants.length) ||
    (next.id && !next.id.startsWith('dom-') && current.id.startsWith('dom-'));

  const mergeItems = (rawItems) => {
    for (const raw of rawItems || []) {
      const item = normalizeItem(raw);
      if (!item) continue;
      const key = mediaKey(item);
      const current = mediaStore.get(key);

      if (!current) {
        mediaStore.set(key, item);
        indexItem(key, item);
        if (item.tweetId) dirtyTweets.add(item.tweetId);
        continue;
      }

      const merged = isBetter(item, current) ? { ...current, ...item } : { ...item, ...current };
      merged.tweetId = current.tweetId || item.tweetId;
      merged.tweetUrl = current.tweetUrl || item.tweetUrl;
      if (merged.tweetId !== current.tweetId || merged.variants.length !== current.variants.length || merged.id !== current.id) {
        unindexItem(key, current);
        mediaStore.set(key, merged);
        indexItem(key, merged);
        if (merged.tweetId) dirtyTweets.add(merged.tweetId);
      }
    }

    while (mediaStore.size > MAX_MEDIA) {
      const [oldestKey, oldest] = mediaStore.entries().next().value;
      mediaStore.delete(oldestKey);
      unindexItem(oldestKey, oldest);
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source !== 'xmd-main' || event.data.type !== 'XMD_MEDIA_BATCH') return;
    if (!Array.isArray(event.data.items)) return;
    mergeItems(event.data.items);
    scheduleScan();
  });

  const tweetIdFromArticle = (article) => {
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      const match = link.getAttribute('href')?.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    return '';
  };

  const tweetUrlFromArticle = (article, tweetId = '') => {
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      const url = canonicalTweetUrl(link.getAttribute('href') || '');
      if (!url) continue;
      if (tweetId && !url.endsWith(`/status/${tweetId}`)) continue;
      return url;
    }
    return tweetId ? `https://x.com/i/status/${tweetId}` : '';
  };

  const fallbackMediaFromArticle = (article, tweetId) => {
    const result = [];
    const tweetUrl = tweetUrlFromArticle(article, tweetId);
    const seen = new Set();

    for (const img of article.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
      const src = img.currentSrc || img.src;
      if (!src || seen.has(src)) continue;
      seen.add(src);
      result.push({
        tweetId,
        tweetUrl,
        id: `dom-${src.split('/').pop().split('?')[0]}`,
        type: 'photo',
        imageUrl: originalImageUrl(src),
        previewUrl: src,
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
        variants: []
      });
    }

    for (const video of article.querySelectorAll('video')) {
      const src = [...video.querySelectorAll('source')].map(s => s.src).find(s => /^https?:/i.test(s)) || (/^https?:/i.test(video.currentSrc) ? video.currentSrc : '');
      if (!src || seen.has(src)) continue;
      seen.add(src);
      result.push({
        tweetId,
        tweetUrl,
        id: `dom-video-${result.length}`,
        type: 'video',
        imageUrl: video.poster || '',
        previewUrl: video.poster || '',
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0,
        variants: [{ url: src, contentType: 'video/mp4', bitrate: 0 }]
      });
    }
    return result;
  };

  const getArticleMedia = (article) => {
    const tweetId = tweetIdFromArticle(article);
    const tweetUrl = tweetUrlFromArticle(article, tweetId);
    const map = new Map();
    for (const key of mediaByTweet.get(tweetId) || []) {
      const item = mediaStore.get(key);
      if (item) map.set(key, item);
    }
    // DOM fallback only fills gaps; it never duplicates or overrides API-captured media.
    for (const raw of fallbackMediaFromArticle(article, tweetId)) {
      const item = normalizeItem(raw);
      if (!item) continue;
      const key = mediaKey(item);
      if (!map.has(key)) map.set(key, mediaStore.get(key) || item);
    }
    return [...map.values()].map(item => ({ ...item, tweetUrl: item.tweetUrl || tweetUrl }));
  };

  const supportsMp4 = (items) => items.some(item => item.variants?.some(isMp4Variant));
  // X renders both videos and animated GIFs as <video>, so that's enough for Snaplytics
  // even before the API response with the variants has been captured.
  const supportsGif = (article, items) => items.some(isGifCandidate) || !!article.querySelector('video');

  const showToast = (text) => {
    let el = document.querySelector('.xmd-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'xmd-toast';
      document.documentElement.appendChild(el);
    }
    el.textContent = text;
    requestAnimationFrame(() => el.classList.add('xmd-show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('xmd-show'), 2600);
  };

  const requestDownload = async (item, format, button = null) => {
    const oldText = button?.textContent || '';
    const wasDisabled = !!button?.disabled;
    if (button) {
      button.disabled = true;
      button.textContent = format === 'gif' ? 'Opening…' : 'Starting…';
    }
    showToast(format === 'gif' ? 'Opening Snaplytics…' : 'Preparing download…');

    try {
      const response = await chrome.runtime.sendMessage({ action: 'xmd-download', item, format });
      if (!response?.ok) throw new Error(response?.error || 'Download failed');
      showToast(format === 'gif' ? 'Snaplytics opened — press Download there' : 'Download started');
    } catch (error) {
      showToast(error?.message || 'Unable to download media');
    } finally {
      if (button?.isConnected) {
        button.disabled = wasDisabled;
        button.textContent = oldText;
      }
    }
  };

  const openPicker = (items, format) => {
    document.querySelector('.xmd-picker-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'xmd-picker-backdrop';

    const panel = document.createElement('div');
    panel.className = 'xmd-picker';
    panel.innerHTML = `
      <div class="xmd-picker-head">
        <div>
          <div class="xmd-picker-title">Choose media</div>
          <div class="xmd-picker-sub">${items.length} items in this post · ${escapeHtml(format.toUpperCase())}</div>
        </div>
        <button class="xmd-picker-close" aria-label="Close">×</button>
      </div>
      <div class="xmd-picker-list"></div>`;

    const list = panel.querySelector('.xmd-picker-list');
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'xmd-picker-item';
      row.innerHTML = `
        <img class="xmd-picker-thumb" alt="" src="${escapeHtml(item.previewUrl || item.imageUrl || '')}">
        <div class="xmd-picker-meta">
          <div class="xmd-picker-type">${escapeHtml(item.type.replace('_', ' '))} ${index + 1}</div>
          <div class="xmd-picker-dim">${item.width && item.height ? `${item.width} × ${item.height}` : 'Best available quality'}</div>
        </div>
        <button class="xmd-picker-go">Download</button>`;
      const go = row.querySelector('.xmd-picker-go');
      go.addEventListener('click', () => requestDownload(item, format, go));
      list.appendChild(row);
    });

    panel.querySelector('.xmd-picker-close').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.appendChild(panel);
    document.documentElement.appendChild(backdrop);
  };

  const handleGif = (article, items, button) => {
    const tweetId = tweetIdFromArticle(article);
    const tweetUrl = tweetUrlFromArticle(article, tweetId);
    const target = items.find(isGifCandidate)
      || (article.querySelector('video') && tweetUrl ? { tweetId, tweetUrl, id: '', type: 'video', variants: [] } : null);
    if (!target) {
      showToast('This post has no GIF or video to convert');
      return;
    }
    // Snaplytics works from the post URL, so one request covers every GIF/video in the post.
    requestDownload(target, 'gif', button);
  };

  const handleFormat = (article, format, triggerButton = null) => {
    const items = getArticleMedia(article);
    if (format === 'gif') {
      handleGif(article, items, triggerButton);
      return;
    }
    if (!items.length) {
      showToast('Media is still loading — scroll the post into view and try again');
      return;
    }
    const eligible = format === 'mp4' ? items.filter(bestMp4) : items;
    if (!eligible.length) {
      showToast('No MP4 video found in this post');
      return;
    }
    if (eligible.length === 1) requestDownload(eligible[0], format, triggerButton);
    else openPicker(eligible, format);
  };

  const makeButton = (label, format) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'xmd-inline-btn';
    button.textContent = label;
    button.dataset.format = format;
    button.title = format === 'original' ? 'Download highest-quality original variant' : (format === 'gif' ? 'Open this post in Snaplytics GIF converter' : `Download as ${label}`);
    return button;
  };

  // Buttons stay enabled until media is known, then reflect what the post actually has.
  const updateButtons = (article) => {
    const wrap = article.querySelector('.xmd-inline-wrap');
    if (!wrap) return;
    const items = getArticleMedia(article);
    const known = items.length > 0;
    wrap.querySelector('[data-format="mp4"]')?.toggleAttribute('disabled', known && !supportsMp4(items));
    wrap.querySelector('[data-format="gif"]')?.toggleAttribute('disabled', known && !supportsGif(article, items));
  };

  const injectIntoArticle = (article) => {
    const hasMedia = article.querySelector('[data-testid="tweetPhoto"], video, img[src*="pbs.twimg.com/media/"]');
    if (!hasMedia) return;

    const reply = article.querySelector('[data-testid="reply"]');
    const group = reply?.closest('div[role="group"]');
    if (!group) return;

    const wrap = document.createElement('span');
    wrap.className = 'xmd-inline-wrap';
    for (const btn of [makeButton('GIF', 'gif'), makeButton('MP4', 'mp4'), makeButton('Original', 'original')]) {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleFormat(article, btn.dataset.format, btn);
      });
      wrap.appendChild(btn);
    }

    group.appendChild(wrap);
    article.dataset.xmdInjected = '1';
    article.dataset.xmdTweet = tweetIdFromArticle(article);
    updateButtons(article);
  };

  let scanQueued = false;
  const scan = () => {
    scanQueued = false;
    // Only articles we haven't handled yet; this runs on every DOM mutation.
    document.querySelectorAll(`${ARTICLE_SELECTOR}:not([data-xmd-injected])`).forEach(injectIntoArticle);
    // Refresh button state only for posts whose media changed since the last scan.
    for (const tweetId of dirtyTweets) {
      document.querySelectorAll(`${ARTICLE_SELECTOR}[data-xmd-tweet="${tweetId}"]`).forEach(updateButtons);
    }
    dirtyTweets.clear();
  };
  const scheduleScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  };

  const observer = new MutationObserver(scheduleScan);
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleScan();
  };
  if (document.documentElement) start();
  else document.addEventListener('readystatechange', () => document.documentElement && start(), { once: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== 'xmd-get-page-media') return;
    scan();
    const articles = [...document.querySelectorAll(ARTICLE_SELECTOR)];
    const seen = new Set();
    const visible = [];
    for (const article of articles) {
      for (const item of getArticleMedia(article)) {
        const key = mediaKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        visible.push(item);
      }
    }
    sendResponse({ ok: true, items: visible });
  });
})();
