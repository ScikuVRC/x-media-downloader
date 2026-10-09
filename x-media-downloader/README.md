# X Media Downloader — Chrome Extension

A Manifest V3 Chrome extension for downloading media from X / Twitter.

## Features

- Adds three compact buttons to media posts on X: **GIF**, **MP4**, and **Original**.
- **GIF** opens the exact X post in Snaplytics' Twitter GIF Downloader, fills the Tweet URL automatically after a 1-second post-load delay, without pressing Snaplytics' Download button.
- **MP4** downloads the highest-bitrate MP4 variant exposed by X.
- **Original photos** use X's `name=orig` image variant where available.
- **Original videos** use the highest-bitrate MP4 variant X exposes.
- The extension popup lists detected media on the current X page.
- Multi-media posts can be selected individually.

## Install / update

1. Unzip the extension folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Remove the older X Media Downloader build, or replace its files with this version.
5. Click **Load unpacked** and select the `x-media-downloader` folder.
6. Reload any X tabs that were already open.

## GIF workflow

Click **GIF** on an X post. The extension opens `https://t.snaplytics.io/twitter-gif-downloader/`, transfers the post URL through the new tab, waits 1 second after Snaplytics finishes loading, then fills the Tweet URL input. It does **not** press Download; you press it yourself after verifying the URL.

## Notes

- GIF conversion is now handled by Snaplytics, not by the extension itself.
- The Snaplytics autofill relies on the converter page retaining a Tweet URL input. If their UI changes substantially, `snaplytics.js` may need an updated selector.
- X can transcode uploaded videos and animated GIFs; Original means the best original-quality variant X still exposes to the page.
- Download only media you have the right or permission to save and use.

## v1.2.0

- Fixed photos appearing twice (once from X's API, once from the page), which made single-photo posts open the "Choose media" picker and made **Download originals** save every photo twice.
- Downloads are now restricted to X's media servers (`*.twimg.com`) and to known file types (jpg, png, webp, gif, mp4). Media data coming from the page is validated before use.
- **GIF** is disabled on photo-only posts and picks the post's GIF/video, not just the first item.
- The MP4 picker lists only items that have an MP4.
- Popup: corrected the GIF wording (it fills in the URL; it does not submit), added "n / total" progress to **Download originals**, and de-duplicates media.
- Snaplytics autofill no longer falls back to search boxes or arbitrary text fields.
- Faster on long timelines: only new posts are scanned on page changes, button state updates only for posts whose media changed, and the media cache is capped.
- Removed the leftover offscreen GIF encoder files and the unused `activeTab`, `*.twimg.com` and Snaplytics host permissions.
- Shared helpers moved into `common.js`.

## v1.1.1

- Replaced local GIF conversion with Snaplytics integration.
- GIF buttons now open the exact X post in Snaplytics.
- Added automatic Tweet URL filling without clicking Snaplytics Download.
- Removed the local offscreen GIF encoder and its permission.


### Snaplytics GIF handoff
The GIF button opens Snaplytics and prefills the canonical X post URL. It intentionally does **not** press Snaplytics' Download button; press Download yourself after confirming the URL.

### v1.1.2
- Waits 1 second after Snaplytics fully loads before pasting the canonical X post URL.
- Does not automatically press Snaplytics Download.
