'use strict';

const listEl = document.getElementById('mediaList');
const statusEl = document.getElementById('status');
const countEl = document.getElementById('count');
const refreshEl = document.getElementById('refresh');
const downloadAllEl = document.getElementById('downloadAll');
let currentItems = [];

const { bestMp4, mediaKey, isGifCandidate, escapeHtml } = self.XMD;

function unique(items) {
  const map = new Map();
  for (const item of items || []) {
    const k = mediaKey(item);
    const prev = map.get(k);
    if (!prev || (!prev.variants?.length && item.variants?.length)) map.set(k, item);
  }
  return [...map.values()];
}

function formatType(type) {
  if (type === 'animated_gif') return 'Animated GIF';
  return type === 'video' ? 'Video' : 'Photo';
}

function qualityLabel(item) {
  const variant = bestMp4(item);
  if (variant?.bitrate) return `${Math.round(variant.bitrate / 1000)} kbps MP4`;
  if (item.width && item.height) return `${item.width} × ${item.height}`;
  return 'Best available quality';
}

async function download(item, format, progressEl) {
  progressEl?.classList.add('show');
  if (progressEl) progressEl.textContent = format === 'gif' ? 'Opening Snaplytics…' : 'Starting download…';
  try {
    const result = await chrome.runtime.sendMessage({ action: 'xmd-download', item, format });
    if (!result?.ok) throw new Error(result?.error || 'Download failed');
    if (progressEl) progressEl.textContent = format === 'gif' ? 'Opened Snaplytics — it fills in the post URL; press Download there.' : 'Sent to Downloads.';
    return true;
  } catch (error) {
    if (progressEl) progressEl.textContent = error?.message || 'Download failed.';
    return false;
  }
}

function render(items) {
  currentItems = unique(items);
  countEl.textContent = String(currentItems.length);
  downloadAllEl.disabled = currentItems.length === 0;
  listEl.innerHTML = '';

  if (!currentItems.length) {
    statusEl.style.display = 'none';
    listEl.innerHTML = '<div class="empty"><strong>No media detected yet.</strong><br>Open an X timeline or post, scroll the media into view, then press ↻.</div>';
    return;
  }

  statusEl.style.display = 'none';
  currentItems.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'media-card';
    const preview = item.previewUrl || item.imageUrl || '';
    const mp4Available = !!bestMp4(item);
    const gifAvailable = isGifCandidate(item);
    const title = item.tweetId ? `Post ${item.tweetId}` : `Media ${index + 1}`;

    card.innerHTML = `
      <div class="preview-wrap">
        ${preview ? `<img class="preview" alt="Media preview" src="${escapeHtml(preview)}">` : ''}
        <span class="badge">${escapeHtml(formatType(item.type))}</span>
      </div>
      <div class="card-body">
        <div class="meta-row">
          <div class="meta-main">
            <div class="meta-title">${escapeHtml(title)}</div>
            <div class="meta-sub">${escapeHtml(qualityLabel(item))}</div>
          </div>
        </div>
        <div class="actions">
          <button class="action" data-format="gif" ${gifAvailable ? '' : 'disabled'}>GIF</button>
          <button class="action" data-format="mp4" ${mp4Available ? '' : 'disabled'}>MP4</button>
          <button class="action primary" data-format="original">Original</button>
        </div>
        <div class="card-progress"></div>
      </div>`;

    const progress = card.querySelector('.card-progress');
    card.querySelectorAll('.action[data-format]').forEach(button => {
      button.addEventListener('click', () => download(item, button.dataset.format, progress));
    });
    listEl.appendChild(card);
  });
}

async function scanPage() {
  statusEl.style.display = 'block';
  statusEl.textContent = 'Scanning the current X page…';
  listEl.innerHTML = '';
  countEl.textContent = '0';
  downloadAllEl.disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/(x\.com|twitter\.com)\//i.test(tab.url || '')) {
    statusEl.textContent = 'Open x.com or twitter.com to use this extension.';
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'xmd-get-page-media' });
    render(response?.items || []);
  } catch (error) {
    statusEl.textContent = 'Reload the X tab once after installing the extension, then try again.';
  }
}

refreshEl.addEventListener('click', scanPage);
downloadAllEl.addEventListener('click', async () => {
  const items = [...currentItems];
  let failed = 0;
  downloadAllEl.disabled = true;
  statusEl.style.display = 'block';
  for (let i = 0; i < items.length; i++) {
    statusEl.textContent = `Downloading ${i + 1} / ${items.length}…`;
    if (!(await download(items[i], 'original', null))) failed++;
  }
  statusEl.textContent = failed
    ? `Sent ${items.length - failed} of ${items.length} to Downloads — ${failed} failed.`
    : `Sent all ${items.length} to Downloads.`;
  downloadAllEl.disabled = false;
});

scanPage();
