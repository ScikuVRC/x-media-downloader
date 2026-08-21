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
