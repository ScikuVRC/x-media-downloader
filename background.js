'use strict';

importScripts('common.js');

const { isTwimgUrl, bestMp4, originalImageUrl, extensionForImage, safeId, canonicalTweetUrl, isGifCandidate } = self.XMD;

const SNAPLYTICS_GIF_URL = 'https://t.snaplytics.io/twitter-gif-downloader/';

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
  // Media items originate from page messages, so never download anything that isn't X's CDN.
  if (!isTwimgUrl(url)) throw new Error('Refused to download: the media URL is not on X\'s media servers.');

  const downloadId = await chrome.downloads.download({
    url,
    filename: filenameFor(item, ext),
    saveAs: false,
    conflictAction: 'uniquify'
  });
  return { ok: true, downloadId };
}

function tweetUrlFor(item) {
  const fromUrl = canonicalTweetUrl(item?.tweetUrl || '');
  if (fromUrl) return fromUrl;
  if (/^\d+$/.test(String(item?.tweetId || ''))) return `https://x.com/i/status/${item.tweetId}`;
  return '';
}

async function openGifConverter(item) {
  if (item?.type === 'photo' && !isGifCandidate(item)) throw new Error('This post has no GIF or video to convert.');
  const tweetUrl = tweetUrlFor(item);
  if (!tweetUrl) throw new Error('Could not determine the X post URL for this media.');
  const url = `${SNAPLYTICS_GIF_URL}#xmd=${encodeURIComponent(tweetUrl)}`;
  const tab = await chrome.tabs.create({ url, active: true });
  if (!tab?.id) throw new Error('Chrome could not open the GIF converter.');
  return { ok: true, tabId: tab.id };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action !== 'xmd-download' || sender.id !== chrome.runtime.id) return;

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
