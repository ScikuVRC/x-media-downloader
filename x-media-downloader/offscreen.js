'use strict';

const sleepFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

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
  } catch (_) { return url; }
}

function safeId(value) {
  return String(value || 'media').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
}

function filenameFor(item) {
  return `X-Media/${safeId(item?.tweetId || 'x')}-${safeId(item?.id || 'media')}.gif`;
}

async function fetchBlob(url) {
  const response = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
  if (!response.ok) throw new Error(`Media request failed (${response.status}).`);
  return response.blob();
}

async function waitForImage(img) {
  if (img.complete && img.naturalWidth) return;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Could not decode the image.'));
  });
}

function fitSize(width, height, maxWidth) {
  if (!width || !height) return { width: maxWidth, height: maxWidth };
  if (width <= maxWidth) return { width, height };
  const scale = maxWidth / width;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function imageToGif(item) {
  const url = originalImageUrl(item.imageUrl || item.previewUrl);
  if (!url) throw new Error('No image URL is available.');
  const blob = await fetchBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = objectUrl;
    await waitForImage(img);
    const size = fitSize(img.naturalWidth, img.naturalHeight, 1400);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const rgba = ctx.getImageData(0, 0, size.width, size.height).data;
    return XMDGifEncoder.encodeGif({ width: size.width, height: size.height, frames: [rgba], delayCs: 10 });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function videoProfile(duration) {
  if (duration <= 10) return { fps: 10, maxWidth: 540, maxDuration: duration };
  if (duration <= 30) return { fps: 6, maxWidth: 480, maxDuration: duration };
  if (duration <= 60) return { fps: 4, maxWidth: 420, maxDuration: duration };
  return { fps: 2, maxWidth: 360, maxDuration: Math.min(duration, 120) };
}

async function waitEvent(target, eventName, errorName = 'error') {
  await new Promise((resolve, reject) => {
    const onDone = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`Media ${errorName}.`)); };
    const cleanup = () => {
      target.removeEventListener(eventName, onDone);
      target.removeEventListener(errorName, onError);
    };
    target.addEventListener(eventName, onDone, { once: true });
    target.addEventListener(errorName, onError, { once: true });
  });
}

async function seekVideo(video, time) {
  if (Math.abs(video.currentTime - time) < 0.002) return;
  const p = waitEvent(video, 'seeked');
  video.currentTime = Math.min(time, Math.max(0, video.duration - 0.001));
  await p;
}

async function videoToGif(item) {
  const variant = bestMp4(item);
  if (!variant) throw new Error('No MP4 variant is available for GIF conversion.');
  const blob = await fetchBlob(variant.url);
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await waitEvent(video, 'loadedmetadata');
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Could not determine video duration.');
    const profile = videoProfile(video.duration);
    const size = fitSize(video.videoWidth, video.videoHeight, profile.maxWidth);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const frameCount = Math.max(1, Math.floor(profile.maxDuration * profile.fps));
    const frames = [];

    for (let i = 0; i < frameCount; i++) {
      const time = Math.min(profile.maxDuration - 0.001, i / profile.fps);
      await seekVideo(video, Math.max(0, time));
      ctx.drawImage(video, 0, 0, size.width, size.height);
      const rgba = ctx.getImageData(0, 0, size.width, size.height).data;
      frames.push(XMDGifEncoder.rgbaTo332(rgba));
      if (i % 8 === 0) await sleepFrame();
    }

    return XMDGifEncoder.encodeGif({
      width: size.width,
      height: size.height,
      frames,
      delayCs: Math.max(2, Math.round(100 / profile.fps)),
      loop: 0
    });
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not prepare the GIF for download.'));
    reader.readAsDataURL(blob);
  });
}

async function convertToGif(item) {
  const bytes = item?.type === 'photo' || !(item?.variants?.length)
    ? await imageToGif(item)
    : await videoToGif(item);

  // A blob: URL belongs to the offscreen document that created it. Passing
  // that URL to the extension service worker can make chrome.downloads fail
  // because the worker is a different execution context. A data: URL is
  // self-contained and can safely cross the runtime messaging boundary.
  const blob = new Blob([bytes], { type: 'image/gif' });
  const dataUrl = await blobToDataUrl(blob);
  if (!dataUrl.startsWith('data:image/gif')) throw new Error('Could not prepare the GIF download URL.');
  return { ok: true, dataUrl, filename: filenameFor(item), byteLength: bytes.byteLength };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'xmd-offscreen' || message?.action !== 'convert-to-gif') return;
  convertToGif(message.item)
    .then(sendResponse)
    .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
