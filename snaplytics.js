(() => {
  'use strict';

  const match = location.hash.match(/(?:^#|[&#])xmd=([^&]+)/);
  if (!match) return;

  let tweetUrl = '';
  try { tweetUrl = decodeURIComponent(match[1]); } catch (_) {}

  const canonicalizeTweetUrl = (value) => {
    try {
      const url = new URL(value);
      if (!/^(?:x\.com|twitter\.com)$/i.test(url.hostname)) return '';
      const status = url.pathname.match(/^\/([^/?#]+)\/status\/(\d+)/i);
      if (!status) return '';
      return `https://x.com/${status[1]}/status/${status[2]}`;
    } catch (_) {
      return '';
    }
  };

  tweetUrl = canonicalizeTweetUrl(tweetUrl);
  if (!tweetUrl) return;

  const setInputValue = (input, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const findInput = () => {
    const inputs = [...document.querySelectorAll('input')];
    return inputs.find(el => /tweet|twitter|x\.com/i.test(`${el.placeholder || ''} ${el.name || ''} ${el.id || ''}`))
      || inputs.find(el => el.type === 'url')
      || inputs.find(el => el.type === 'text');
  };

  let attempts = 0;
  const fillOnly = () => {
    attempts += 1;
    const input = findInput();
    if (!input) {
      if (attempts < 80) setTimeout(fillOnly, 125);
      return;
    }

    setInputValue(input, tweetUrl);
    input.focus();

    // The extension intentionally does NOT press Snaplytics' Download button.
    // Remove only our transport fragment after the URL has been copied into the form.
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
  };

  const startAfterDelay = () => setTimeout(fillOnly, 1000);

  // Wait until Snaplytics has fully loaded, then give its own JavaScript another
  // full second to initialize before inserting the X post URL.
  if (document.readyState === 'complete') startAfterDelay();
  else window.addEventListener('load', startAfterDelay, { once: true });
})();
