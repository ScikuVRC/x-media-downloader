(() => {
  'use strict';

  const mediaByTweet = new Map();
  let allMedia = [];
  let toastTimer = 0;

  const uniqueKey = (item) => `${item.tweetId || ''}|${item.id || ''}|${item.imageUrl || ''}|${item.variants?.[0]?.url || ''}`;

  const normalizeItem = (item) => ({
    tweetId: String(item.tweetId || ''),
    tweetUrl: String(item.tweetUrl || ''),
    id: String(item.id || ''),
    type: item.type || 'photo',
    imageUrl: item.imageUrl || '',
    previewUrl: item.previewUrl || item.imageUrl || '',
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    durationMs: Number(item.durationMs || 0),
    variants: Array.isArray(item.variants) ? item.variants.filter(v => v?.url) : []
  });

  const mergeItems = (items) => {
    let changed = false;
    const existing = new Map(allMedia.map(item => [uniqueKey(item), item]));
    for (const raw of items || []) {
      const item = normalizeItem(raw);
      const key = uniqueKey(item);
      if (!existing.has(key)) {
        existing.set(key, item);
        allMedia.push(item);
        changed = true;
      } else {
        const current = existing.get(key);
        if ((!current.variants?.length && item.variants?.length) || (!current.tweetId && item.tweetId)) {
          Object.assign(current, item);
          changed = true;
        }
      }
    }
    if (changed) rebuildIndex();
  };

  const rebuildIndex = () => {
    mediaByTweet.clear();
    for (const item of allMedia) {
      if (!item.tweetId) continue;
      if (!mediaByTweet.has(item.tweetId)) mediaByTweet.set(item.tweetId, []);
      const list = mediaByTweet.get(item.tweetId);
      if (!list.some(x => uniqueKey(x) === uniqueKey(item))) list.push(item);
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'xmd-main') return;
    if (event.data.type === 'XMD_MEDIA_BATCH') {
      mergeItems(event.data.items);
      scheduleScan();
    }
  });

  const tweetIdFromArticle = (article) => {
    const links = article.querySelectorAll('a[href*="/status/"]');
    for (const link of links) {
      const match = link.getAttribute('href')?.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    return '';
  };

  const tweetUrlFromArticle = (article, tweetId = '') => {
    const links = article.querySelectorAll('a[href*="/status/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/^(?:https?:\/\/(?:x\.com|twitter\.com))?\/([^/?#]+)\/status\/(\d+)/i);
      if (!match) continue;
      if (tweetId && match[2] !== String(tweetId)) continue;
      return `https://x.com/${match[1]}/status/${match[2]}`;
    }
    return tweetId ? `https://x.com/i/status/${tweetId}` : '';
  };

  const originalImageUrl = (url) => {
    try {
      const u = new URL(url);
      if (u.hostname.endsWith('twimg.com') && /\/media\//.test(u.pathname)) {
        u.searchParams.set('name', 'orig');
      }
      return u.toString();
    } catch (_) {
      return url;
    }
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
        id: `dom-${result.length}-${src.split('/').pop()}`,
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
    const cached = tweetId ? (mediaByTweet.get(tweetId) || []) : [];
    const fallback = fallbackMediaFromArticle(article, tweetId);
    const map = new Map();
    [...cached, ...fallback].forEach(item => map.set(uniqueKey(item), item));
    const tweetUrl = tweetUrlFromArticle(article, tweetId);
    return [...map.values()].map(item => ({ ...item, tweetUrl: item.tweetUrl || tweetUrl }));
  };

  const supportsMp4 = (items) => items.some(item => item.variants?.some(v => /video\/mp4/i.test(v.contentType || '') || /\.mp4(?:\?|$)/i.test(v.url)));
  const supportsGif = (items) => items.length > 0;

  const bestVideo = (item) => {
    const mp4 = (item.variants || [])
      .filter(v => /video\/mp4/i.test(v.contentType || '') || /\.mp4(?:\?|$)/i.test(v.url))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return mp4[0] || null;
  };

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
          <div class="xmd-picker-sub">${items.length} items in this post · ${format.toUpperCase()}</div>
        </div>
        <button class="xmd-picker-close" aria-label="Close">×</button>
      </div>
      <div class="xmd-picker-list"></div>`;

    const list = panel.querySelector('.xmd-picker-list');
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'xmd-picker-item';
      const canUse = format !== 'mp4' || !!bestVideo(item);
      row.innerHTML = `
        <img class="xmd-picker-thumb" alt="" src="${escapeAttr(item.previewUrl || item.imageUrl || '')}">
        <div class="xmd-picker-meta">
          <div class="xmd-picker-type">${escapeHtml(item.type.replace('_', ' '))} ${index + 1}</div>
          <div class="xmd-picker-dim">${item.width && item.height ? `${item.width} × ${item.height}` : 'Best available quality'}</div>
        </div>
        <button class="xmd-picker-go" ${canUse ? '' : 'disabled'}>${canUse ? (format === 'gif' ? 'Open' : 'Download') : 'N/A'}</button>`;
      row.querySelector('.xmd-picker-go').addEventListener('click', () => {
        requestDownload(item, format, row.querySelector('.xmd-picker-go'));
      });
      list.appendChild(row);
    });

    panel.querySelector('.xmd-picker-close').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.appendChild(panel);
    document.documentElement.appendChild(backdrop);
  };

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const escapeAttr = escapeHtml;

  const handleFormat = (article, format, triggerButton = null) => {
    const items = getArticleMedia(article);
    if (!items.length) {
      showToast('Media is still loading — scroll the post into view and try again');
      return;
    }
    if (format === 'gif') {
      requestDownload(items[0], format, triggerButton);
      return;
    }
    const eligible = format === 'mp4' ? items.filter(bestVideo) : items;
    if (!eligible.length) {
      showToast('No MP4 video found in this post');
      return;
    }
    if (eligible.length === 1) requestDownload(eligible[0], format, triggerButton);
    else openPicker(items, format);
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

  const injectIntoArticle = (article) => {
    if (article.dataset.xmdInjected === '1') {
      const wrap = article.querySelector('.xmd-inline-wrap');
      if (wrap) {
        const items = getArticleMedia(article);
        wrap.querySelector('[data-format="mp4"]')?.toggleAttribute('disabled', !supportsMp4(items));
      }
      return;
    }

    const hasMedia = article.querySelector('[data-testid="tweetPhoto"], video, img[src*="pbs.twimg.com/media/"]');
    if (!hasMedia) return;

    const reply = article.querySelector('[data-testid="reply"]');
    const group = reply?.closest('div[role="group"]');
    if (!group) return;

    const items = getArticleMedia(article);
    const wrap = document.createElement('span');
    wrap.className = 'xmd-inline-wrap';
    const gif = makeButton('GIF', 'gif');
    const mp4 = makeButton('MP4', 'mp4');
    const original = makeButton('Original', 'original');
    mp4.disabled = items.length > 0 && !supportsMp4(items);
    gif.disabled = items.length > 0 && !supportsGif(items);

    for (const btn of [gif, mp4, original]) {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleFormat(article, btn.dataset.format, btn);
      });
      wrap.appendChild(btn);
    }

    group.appendChild(wrap);
    article.dataset.xmdInjected = '1';
  };

  let scanQueued = false;
  const scan = () => {
    scanQueued = false;
    document.querySelectorAll('article[data-testid="tweet"]').forEach(injectIntoArticle);
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
    if (message?.action === 'xmd-get-page-media') {
      document.querySelectorAll('article[data-testid="tweet"]').forEach(article => mergeItems(fallbackMediaFromArticle(article, tweetIdFromArticle(article))));
      const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
      const urlByTweet = new Map(articles.map(article => {
        const id = tweetIdFromArticle(article);
        return [id, tweetUrlFromArticle(article, id)];
      }).filter(([id]) => id));
      const visibleTweetIds = new Set(urlByTweet.keys());
      const enrich = (item) => ({ ...item, tweetUrl: urlByTweet.get(item.tweetId) || item.tweetUrl || (item.tweetId ? `https://x.com/i/status/${item.tweetId}` : '') });
      const visible = allMedia.filter(item => !item.tweetId || visibleTweetIds.has(item.tweetId)).map(enrich);
      sendResponse({ ok: true, items: visible.length ? visible : allMedia.map(enrich) });
      return;
    }
    if (message?.action === 'xmd-rescan') {
      window.postMessage({ source: 'xmd-isolated', type: 'XMD_RESCAN_DOM_HINT' }, '*');
      scan();
      sendResponse({ ok: true });
    }
  });
})();
