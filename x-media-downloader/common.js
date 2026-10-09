// Shared helpers for the background worker, the isolated content script and the popup.
// Not loaded in the page's MAIN world, so nothing here is visible to x.com scripts.
(() => {
  'use strict';

  const IMAGE_EXTS = new Set(['jpg', 'png', 'webp', 'gif']);

  // Only https URLs on twimg.com (pbs.twimg.com, video.twimg.com, …) are treated as media.
  const isTwimgUrl = (value) => {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && (u.hostname === 'twimg.com' || u.hostname.endsWith('.twimg.com'));
    } catch (_) {
      return false;
    }
  };

  const isMp4Variant = (v) => !!v?.url && (/video\/mp4/i.test(v.contentType || '') || /\.mp4(?:\?|$)/i.test(v.url));

  const bestMp4 = (item) => (item?.variants || [])
    .filter(isMp4Variant)
    .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0] || null;

  const originalImageUrl = (url) => {
    try {
      const u = new URL(url);
      if (u.hostname.endsWith('twimg.com') && /\/media\//.test(u.pathname)) u.searchParams.set('name', 'orig');
      return u.toString();
    } catch (_) {
      return url;
    }
  };

  // Returns a whitelisted image extension, or 'jpg' when the URL doesn't say.
  const extensionForImage = (url) => {
    try {
      const u = new URL(url);
      let ext = (u.searchParams.get('format') || '').toLowerCase();
      if (!ext) ext = (u.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      return IMAGE_EXTS.has(ext) ? ext : 'jpg';
    } catch (_) {
      return 'jpg';
    }
  };

  const safeId = (value) => String(value || 'media').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);

  // A stable identity for one piece of media, shared by API-captured and DOM-scraped items.
  // Photos and video posters both live on pbs.twimg.com under a path that is identical in
  // the API response and in the rendered page, apart from the extension and query string:
  //   https://pbs.twimg.com/media/ABC.jpg            (API)
  //   https://pbs.twimg.com/media/ABC?format=jpg&name=small  (DOM)
  const mediaPathKey = (url) => {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname.replace(/\.[a-z0-9]{2,5}$/i, '')}`;
    } catch (_) {
      return '';
    }
  };

  const mediaKey = (item) => {
    const fromImage = mediaPathKey(item?.imageUrl || item?.previewUrl || '');
    if (fromImage) return fromImage;
    const fromVideo = mediaPathKey(item?.variants?.[0]?.url || '');
    if (fromVideo) return fromVideo;
    return `${item?.tweetId || ''}|${item?.id || ''}`;
  };

  const canonicalTweetUrl = (value) => {
    try {
      const url = new URL(value, 'https://x.com');
      if (!/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) return '';
      const match = url.pathname.match(/^\/([^/?#]+)\/status\/(\d+)/i);
      return match ? `https://x.com/${match[1]}/status/${match[2]}` : '';
    } catch (_) {
      return '';
    }
  };

  const isGifCandidate = (item) => item?.type === 'animated_gif' || item?.type === 'video' || !!bestMp4(item);

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  self.XMD = Object.freeze({
    isTwimgUrl, isMp4Variant, bestMp4, originalImageUrl, extensionForImage,
    safeId, mediaKey, canonicalTweetUrl, isGifCandidate, escapeHtml
  });
})();
