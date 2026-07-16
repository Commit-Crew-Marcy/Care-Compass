# CareCompass Browser Guide

A Chrome Manifest V3 extension that explains the current benefits website in
short, plain language and helps the user find safe next steps.

## What it does

- Reads visible page text only after the user opens the extension.
- Sends a filtered semantic page summary to the CareCompass FastAPI backend.
- Uses the server's Anthropic API key; the key is never stored in Chrome.
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

1. Start the backend from `backend/` and set `ANTHROPIC_API_KEY` in the backend
   environment.
2. Start the CareCompass frontend on `http://localhost:5173`.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Select **Load unpacked** and choose this `extension/` folder.
6. Pin **CareCompass Browser Guide**, open a regular website, and select it.

When used on a local CareCompass frontend (ports 5173–5175), the extension calls
`http://localhost:8000`. On other sites it calls the deployed CareCompass API.

## Checks

```bash
npm test
npm run check
```

## Publishing

Before publishing to the Chrome Web Store:

1. Add store icons and screenshots.
2. Publish a privacy policy that explains the visible-page text sent to the
   CareCompass backend and Anthropic.
3. Verify the production backend URL in `manifest.json` and `background.js`.
4. Zip the contents of this directory (with `manifest.json` at the zip root).
5. Put the final Chrome Web Store URL in the frontend environment variable
   `VITE_EXTENSION_INSTALL_URL` so the website prompt becomes a one-click
   install link.
