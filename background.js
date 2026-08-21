'use strict';

const SNAPLYTICS_GIF_URL = 'https://t.snaplytics.io/twitter-gif-downloader/';

function bestMp4(item) {
  return (item?.variants || [])
    .filter(v => /video\/mp4/i.test(v.contentType || '') || /\.mp4(?:\?|$)/i.test(v.url || ''))
    .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0] || null;
}

function originalImageUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('twimg.com') && /\/media\//.test(u.pathname)) u.searchParams.set('name', 'orig');
    return u.toString();
  } catch (_) {
    return url;
  }
}

function extensionForImage(url) {
  try {
    const u = new URL(url);
    const format = u.searchParams.get('format');
    if (format && /^[a-z0-9]+$/i.test(format)) return format === 'jpeg' ? 'jpg' : format;
    const match = u.pathname.match(/\.([a-z0-9]{2,5})$/i);
    return match ? (match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()) : 'jpg';
  } catch (_) {
    return 'jpg';
  }
}

function safeId(value) {
  return String(value || 'media').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
}

function filenameFor(item, ext) {
  const tweet = safeId(item?.tweetId || 'x');
  const id = safeId(item?.id || 'media');
  return `X-Media/${tweet}-${id}.${ext}`;
}

async function directDownload(item, format) {
  let url;
  let ext;

  if (format === 'mp4') {
    const variant = bestMp4(item);
    if (!variant) throw new Error('No MP4 variant was found for this media.');
    url = variant.url;
    ext = 'mp4';
  } else if (format === 'original') {
    if (item?.type === 'photo' || (!item?.variants?.length && item?.imageUrl)) {
      url = originalImageUrl(item.imageUrl || item.previewUrl);
      ext = extensionForImage(url);
    } else {
      const variant = bestMp4(item);
      if (!variant) throw new Error('X did not expose a downloadable original video variant.');
      url = variant.url;
      ext = 'mp4';
    }
  } else {
    throw new Error('Unsupported direct-download format.');
  }

  if (!url) throw new Error('No media URL is available yet.');
  const downloadId = await chrome.downloads.download({
    url,
    filename: filenameFor(item, ext),
    saveAs: false,
    conflictAction: 'uniquify'
  });
  return { ok: true, downloadId };
}

function tweetUrlFor(item) {
  if (item?.tweetUrl) {
    try {
      const url = new URL(item.tweetUrl);
      if (/^(?:x\.com|twitter\.com)$/i.test(url.hostname)) {
        const match = url.pathname.match(/^\/([^/?#]+)\/status\/(\d+)/i);
        if (match) return `https://x.com/${match[1]}/status/${match[2]}`;
      }
    } catch (_) {}
  }
  if (item?.tweetId) return `https://x.com/i/status/${encodeURIComponent(String(item.tweetId))}`;
  return '';
}

async function openGifConverter(item) {
  const tweetUrl = tweetUrlFor(item);
  if (!tweetUrl) throw new Error('Could not determine the X post URL for this media.');
  const url = `${SNAPLYTICS_GIF_URL}#xmd=${encodeURIComponent(tweetUrl)}`;
  const tab = await chrome.tabs.create({ url, active: true });
  if (!tab?.id) throw new Error('Chrome could not open the GIF converter.');
  return { ok: true, tabId: tab.id };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== 'xmd-download') return;

  (async () => {
    try {
      if (message.format === 'gif') {
        sendResponse(await openGifConverter(message.item));
      } else {
        sendResponse(await directDownload(message.item, message.format));
      }
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();

  return true;
});
