(() => {
  'use strict';

  const postedFingerprints = new Set();
  const MAX_FINGERPRINTS = 4000;

  const normalizeVariant = (variant) => {
    if (!variant || typeof variant.url !== 'string') return null;
    return {
      url: variant.url,
      contentType: variant.content_type || variant.contentType || '',
      bitrate: Number(variant.bitrate || 0)
    };
  };

  const mediaFromEntity = (entity, tweetId) => {
    if (!entity || typeof entity !== 'object') return null;
    const type = entity.type || (entity.video_info ? 'video' : 'photo');
    const imageUrl = entity.media_url_https || entity.media_url || '';
    const variants = Array.isArray(entity.video_info?.variants)
      ? entity.video_info.variants.map(normalizeVariant).filter(Boolean)
      : [];

    // Skip entities with nothing downloadable; never invent a random id (it defeats de-duplication).
    if (!imageUrl && !variants.length) return null;
    const id = String(entity.id_str || entity.id || entity.media_key || '');
    const width = Number(entity.original_info?.width || entity.sizes?.large?.w || 0);
    const height = Number(entity.original_info?.height || entity.sizes?.large?.h || 0);

    return {
      tweetId: tweetId ? String(tweetId) : '',
      id,
      type,
      imageUrl,
      previewUrl: imageUrl,
      width,
      height,
      durationMs: Number(entity.video_info?.duration_millis || 0),
      variants
    };
  };

  const findTweetId = (obj, inherited) => {
    if (!obj || typeof obj !== 'object') return inherited || '';
    if (obj.legacy && typeof obj.legacy === 'object') {
      const legacyId = obj.legacy.id_str || obj.legacy.id;
      if (legacyId && (obj.legacy.extended_entities || obj.legacy.entities || obj.__typename === 'Tweet')) {
        return String(legacyId);
      }
    }
    if ((obj.extended_entities || obj.entities) && (obj.id_str || obj.id)) {
      return String(obj.id_str || obj.id);
    }
    if (obj.__typename === 'Tweet' && obj.rest_id) return String(obj.rest_id);
    if (obj.tweet_results?.result?.rest_id) return String(obj.tweet_results.result.rest_id);
    return inherited || '';
  };

  const emit = (items) => {
    if (!items.length) return;
    const fresh = [];
    for (const item of items) {
      const variantKey = item.variants.map(v => `${v.url}|${v.bitrate}`).join(',');
      const key = `${item.tweetId}|${item.id}|${item.type}|${item.imageUrl}|${variantKey}`;
      if (postedFingerprints.has(key)) continue;
      postedFingerprints.add(key);
      fresh.push(item);
    }
    if (postedFingerprints.size > MAX_FINGERPRINTS) postedFingerprints.clear();
    if (fresh.length) {
      window.postMessage({ source: 'xmd-main', type: 'XMD_MEDIA_BATCH', items: fresh }, location.origin);
    }
  };

  const scanJson = (root) => {
    const found = [];
    const seen = new WeakSet();

    const walk = (node, inheritedTweetId = '', depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 22) return;
      if (seen.has(node)) return;
      seen.add(node);

      const tweetId = findTweetId(node, inheritedTweetId);

      const candidates = [];
      if (Array.isArray(node.extended_entities?.media)) candidates.push(node.extended_entities.media);
      if (Array.isArray(node.legacy?.extended_entities?.media)) candidates.push(node.legacy.extended_entities.media);
      if (Array.isArray(node.entities?.media) && node.entities.media.some(m => m?.video_info)) candidates.push(node.entities.media);

      for (const list of candidates) {
        for (const entity of list) {
          const item = mediaFromEntity(entity, tweetId);
          if (item) found.push(item);
        }
      }

      if (Array.isArray(node)) {
        for (const child of node) walk(child, tweetId, depth + 1);
      } else {
        for (const [key, child] of Object.entries(node)) {
          if (key === 'extended_entities' || key === 'entities') continue;
          walk(child, tweetId, depth + 1);
        }
      }
    };

    walk(root);
    emit(found);
  };

  const shouldInspectUrl = (url) => {
    if (!url) return false;
    const text = String(url);
    return /\/graphql\/|\/i\/api\/|Tweet|Timeline|Search|Bookmarks|Likes/i.test(text);
  };

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      try {
        // fetch() accepts a string, a URL object or a Request.
        const input = args[0];
        const requestUrl = input instanceof Request ? input.url : String(input ?? '');
        if (shouldInspectUrl(requestUrl)) {
          const contentType = response.headers?.get?.('content-type') || '';
          if (/json/i.test(contentType)) {
            response.clone().json().then(scanJson).catch(() => {});
          }
        }
      } catch (_) {}
      return response;
    };
  }

  const XHR = window.XMLHttpRequest;
  if (XHR?.prototype) {
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;

    XHR.prototype.open = function(method, url, ...rest) {
      this.__xmdUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    XHR.prototype.send = function(...args) {
      this.addEventListener('load', function() {
        try {
          if (!shouldInspectUrl(this.__xmdUrl)) return;
          const type = this.getResponseHeader?.('content-type') || '';
          if (!/json/i.test(type)) return;
          if (this.responseType === 'json' && this.response) scanJson(this.response);
          else if (!this.responseType || this.responseType === 'text') scanJson(JSON.parse(this.responseText));
        } catch (_) {}
      }, { once: true });
      return originalSend.apply(this, args);
    };
  }

})();
