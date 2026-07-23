# CareCompass Browser Guide

A Chrome Manifest V3 extension that explains the current benefits website in
short, plain language and helps the user find safe next steps.

## What it does

- Reads visible page text only after the user opens the extension.
- Sends a filtered semantic page summary to the CareCompass FastAPI backend.
- Uses Gemini through the CareCompass backend; the Gemini key is never stored
  in Chrome or sent to a website.
- Can scroll to or focus a visible control.
- Can select a safe navigation link or non-form button only after the user
  confirms. It will not fill or submit forms, apply for benefits, enter
  sensitive data, or click account/payment controls.
- Offers Simple (up to 80 words) and More detail (up to 160 words) responses,
  plus browser read-aloud support.

The extension requests `activeTab` instead of `<all_urls>`. Chrome grants page
access only after the user selects the extension, and revokes that access when
the user leaves the site.

## Run locally

1. Copy `backend/.env.example` to `backend/.env`, set `GEMINI_API_KEY`, and
   start the backend. `GEMINI_MODEL` is optional and defaults to
   the low-latency `gemini-3.1-flash-lite`; temporary overloads fall back to
   `gemini-3-flash-preview`.
2. Start the CareCompass frontend on `http://localhost:5173`.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Select **Load unpacked** and choose this `extension/` folder.
6. On the extension card, select **Details → Extension options → Local
   development**. This lets an external benefits website use your local API.
7. Pin **CareCompass Browser Guide**, open a regular website, and select it.

When used on a localhost page, the extension calls `http://localhost:8000`.
On other sites, Automatic mode calls the deployed CareCompass API. The
developer option can explicitly use localhost while testing external sites.

## Checks

```bash
npm test
npm run check
```

## Publishing

Before publishing to the Chrome Web Store:

1. Add store icons and screenshots.
2. Publish a privacy policy that explains the visible-page text sent to the
   CareCompass backend and Google Gemini.
3. Verify the production backend URL in `manifest.json` and `background.js`.
4. Zip the contents of this directory (with `manifest.json` at the zip root).
5. Put the final Chrome Web Store URL in the frontend environment variable
   `VITE_EXTENSION_INSTALL_URL` so the website prompt becomes a one-click
   install link.
