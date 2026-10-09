# X Media Downloader — Chrome Extension

**Version 1.2.0** · Manifest V3 · Chrome 116+

A Chrome extension for downloading photos, videos and GIFs from X / Twitter at the best quality X makes available.

## Features

- **Inline buttons on every media post.** Each post with media gets three compact buttons next to the reply/like row: **GIF**, **MP4** and **Original**.
- **Original:** photos download as X's full-size `name=orig` variant. Videos and GIFs download as the highest-bitrate MP4.
- **MP4:** downloads the highest-bitrate MP4 for videos and animated GIFs. The button is disabled on posts with no video.
- **GIF:** opens the post in Snaplytics' Twitter GIF Downloader and fills in the post URL for you. It does **not** press Snaplytics' Download button. You check the URL and press it yourself. The button is disabled on photo-only posts.
- **Multi-media posts:** when a post has several items, a picker lets you choose which one to download. The MP4 picker only lists items that have an MP4.
- **Toolbar popup:** lists the media on the posts currently on screen, with per-item GIF / MP4 / Original buttons and a **Download originals** button that saves everything with live progress ("3 / 8").

Files are saved to your Downloads folder under `X-Media/`, named `<postID>-<mediaID>.<ext>`.

## Install

1. Unzip the extension folder.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `x-media-downloader` folder.
5. Reload any X tabs that were already open.

## Update from an older version

1. In `chrome://extensions`, remove the old X Media Downloader, or replace its folder's files with this version and press the reload icon on the extension's card.
2. If you're replacing files, delete `offscreen.html`, `offscreen.js` and `gif_encoder.js` from the old folder. They're no longer used.
3. Reload any open X tabs.

## Using it

**On a post:** scroll a post into view and click **Original**, **MP4** or **GIF**. A small notice at the bottom of the page confirms the download started or explains why it couldn't.

**From the toolbar:** click the extension icon while on x.com or twitter.com. Press ↻ to rescan after scrolling.

**GIF workflow:** click **GIF** on a post. A new tab opens `https://t.snaplytics.io/twitter-gif-downloader/`. About a second after the page finishes loading, the post URL is filled into the Tweet URL field. Check it, then press Download on Snaplytics. If Snaplytics changes its page so there's no clearly identifiable URL field, the extension leaves the page untouched rather than filling the wrong box, and you can paste the link yourself.

## Permissions

| Permission | Why |
|---|---|
| `downloads` | Save media to your Downloads folder. |
| `x.com`, `twitter.com` | Add the buttons to posts and let the popup read media on the current tab. |

The extension also runs a small script on `t.snaplytics.io/twitter-gif-downloader/` to fill in the post URL. It only acts when the page was opened by the GIF button.

## Privacy and security

- The extension reads media details from X's own page data and the posts on screen. It doesn't collect, store or send anything anywhere.
- The only data that leaves X is the post URL, sent to Snaplytics, and only when you click **GIF**.
- Downloads are limited to X's media servers (`*.twimg.com`) over HTTPS, and to `jpg`, `png`, `webp`, `gif` and `mp4` files. Media details coming from the page are validated before use, so other scripts on x.com can't make the extension download something else.

## Files

| File | Role |
|---|---|
| `manifest.json` | Extension manifest. |
| `common.js` | Shared helpers (best-MP4 selection, URL checks, media de-duplication). |
| `capture.js` | Runs in the page and reads media details from X's API responses. |
| `content.js`, `content.css` | Adds the buttons, the picker and the notices to posts. |
| `background.js` | Validates and performs downloads, and opens Snaplytics. |
| `popup.html`, `popup.js`, `popup.css` | Toolbar popup. |
| `snaplytics.js` | Fills in the post URL on Snaplytics. |
| `icons/` | Extension icons. |

## Notes

- X re-encodes uploaded videos and GIFs. "Original" means the best version X still serves, not necessarily the file that was uploaded.
- Media appears once X has loaded it. If a button says media is still loading, scroll the post fully into view and try again.
- Only download media you have the right or permission to save and use.

## Changelog

### 1.2.0

**Fixes**
- Photos no longer appear twice. Single-photo posts now download directly instead of opening the picker, and **Download originals** no longer saves every photo twice.
- **GIF** is disabled on photo-only posts and opens the post's GIF or video.
- The MP4 picker only lists items that have an MP4.
- Popup wording now correctly says GIF fills in the link but doesn't submit it.
- Snaplytics autofill no longer falls back to a search box or an unrelated text field.

**Security**
- Downloads are restricted to `*.twimg.com` over HTTPS and to known media file types.
- Media details passed from the page are validated, and messages are only accepted from x.com itself.

**Improvements**
- **Download originals** shows progress and reports how many succeeded or failed.
- Faster on long timelines: page changes only scan new posts, buttons update only when a post's media changes, and the in-memory media list is capped.

**Cleanup**
- Removed the unused offscreen GIF encoder files and the unneeded `activeTab`, `*.twimg.com` and Snaplytics host permissions.
- Shared helpers moved into `common.js`.

### 1.1.2
- Waits 1 second after Snaplytics finishes loading before filling in the post URL.
- Does not press Snaplytics' Download button.

### 1.1.1
- Replaced the built-in GIF conversion with the Snaplytics handoff.
- GIF buttons open the exact X post in Snaplytics with the URL filled in.
- Removed the offscreen GIF encoder and its permission.
