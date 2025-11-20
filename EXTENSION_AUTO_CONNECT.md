# Extension Auto-Connect Feature

## Overview
The Chrome extension now automatically connects to the Virtual Closet app to retrieve authentication credentials. Users no longer need to manually copy/paste tokens.

## How It Works

### 1. App Detection
- The extension injects `app-content.js` into `http://localhost:5173` and `https://*.vercel.app`.
- It sets a DOM attribute `data-extension-installed="true"` on the `<html>` tag.
- The web app polls for this attribute to detect the extension.

### 2. Credential Handshake
1. Web app detects `data-extension-installed="true"`.
2. Web app dispatches a custom DOM event `CLOSET_SEND_TOKEN` with the current Supabase session token.
3. `app-content.js` listens for this event and forwards the token to the extension's background script via `chrome.runtime.sendMessage`.
4. Background script saves the token to `chrome.storage.local`.
5. `app-content.js` dispatches `CLOSET_EXTENSION_CONNECTED` back to the web app to confirm success.
6. Web app shows a success toast.

## Files Modified

- **extension/manifest.json**: Added `app-content.js` and updated permissions.
- **extension/app-content.js**: New content script for the app page.
- **extension/background.js**: Handler for `SAVE_TOKEN` message.
- **src/pages/MarketplacesPage.tsx**: Logic to detect extension and send token.

## Security
- Communication happens strictly within the browser via standard Chrome Extension APIs.
- Token is stored in local extension storage (not sync).
- Content script only runs on specific domains (localhost and vercel.app).

## Testing
1. Load the updated extension in Chrome.
2. Refresh the Marketplaces page in the app.
3. You should see a "Extension connected automatically!" toast.
4. Verify token is saved by inspecting the extension background page console or storage.

