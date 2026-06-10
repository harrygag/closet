# Depop Auth Cookie Capture Extension with Firebase Sync 🔥

A Chrome Extension (Manifest V3) that automatically captures Depop authentication cookies and syncs them to Firebase Firestore for cross-device access.

## Features

- ✅ **Automatic Cookie Capture** - Captures Depop cookies when you log in
- ✅ **Firebase Sync** - Syncs cookies to Firestore in real-time
- ✅ **Cross-Device Access** - Access your cookies from any device/script
- ✅ **Auto-Sync Toggle** - Enable/disable automatic Firebase sync
- ✅ **Manual Sync** - Upload/download cookies on demand
- ✅ **Export to Clipboard** - Copy cookies as JSON for scripts
- ✅ **Session Management** - Test authentication, clear cookies
- ✅ **httpOnly Support** - Captures httpOnly and secure cookies

## Key Cookies Captured

**Authentication**:
- `access_token` - Main Depop session token
- `user_id` - Your Depop user ID
- `external_id` - External identifier

**Session**:
- `language`, `NEXT_LOCALE` - Locale settings
- `cf_clearance` - Cloudflare security token

Plus 40+ tracking, analytics, and security cookies.

---

## Installation

### 1. Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `depop-auth-extension` folder
5. Extension icon appears in toolbar

### 2. Verify Installation

- Extension icon should be visible
- No errors in `chrome://extensions/`
- Click icon to see popup UI

---

## Usage

### Basic Cookie Capture

#### Automatic Capture (Recommended)
1. Navigate to https://www.depop.com
2. Log in to your account
3. Extension automatically captures cookies
4. Click extension icon to view captured cookies

#### Manual Capture
1. Click extension icon
2. Click **📸 Capture Cookies Now**
3. Cookies are captured and stored locally

### Firebase Sync 🔥

#### Enable Auto-Sync
1. Click extension icon
2. Toggle **Auto-sync** switch to ON
3. Cookies automatically sync to Firebase whenever they change
4. Green status shows last sync time

#### Manual Sync to Firebase
1. Click **⬆️ Sync to Firebase**
2. Uploads all cookies to Firestore
3. Shows success message with cookie count

#### Manual Sync from Firebase
1. Click **⬇️ Sync from Firebase**
2. Downloads cookies from Firestore
3. Overwrites local cookies with cloud version
4. Useful for syncing across devices

### Export Cookies

1. Click **📋 Export to Clipboard**
2. Cookies copied as JSON to clipboard
3. Paste into your automation scripts

**Export Format**:
```json
{
  "exported_at": "2025-12-01T22:00:00.000Z",
  "cookie_count": 45,
  "cookies": {
    "access_token": {
      "name": "access_token",
      "value": "2bf1ca8e77a59cf92c1c0287cbe763da7fc65b5b",
      "domain": "www.depop.com",
      "path": "/",
      "httpOnly": false,
      "secure": false,
      "captured_at": "2025-12-01T22:00:00.000Z"
    }
  }
}
```

### Test Authentication

1. Click **🧪 Test Authentication**
2. Makes request to Depop with cookies
3. Shows ✅ if authenticated, ❌ if not

### Clear Cookies

1. Click **🗑️ Clear Stored Cookies**
2. Confirm the action
3. All local cookies deleted
4. Firebase cookies remain (download again if needed)

---

## Firebase Integration

### How It Works

```
Depop Login
    ↓
Chrome Extension captures cookies
    ↓
Stored in chrome.storage.local (local)
    ↓
[If Auto-Sync ON]
    ↓
Synced to Firebase Firestore (cloud)
    ↓
Accessible from any device/script
```

### Firebase Architecture

**Project**: `closet-da8f2`
**Collection**: `depop_cookies`
**Document ID**: `default` (or custom user ID)

**Document Structure**:
```javascript
{
  cookies: {
    access_token: { name, value, domain, ... },
    user_id: { ... },
    // ... all cookies
  },
  lastSync: Timestamp,
  cookieCount: 45,
  updatedAt: "2025-12-01T22:00:00.000Z"
}
```

### Accessing Cookies from Scripts

#### Node.js with Firebase Admin SDK

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function getDepopCookies() {
  const doc = await db.collection('depop_cookies').doc('default').get();

  if (doc.exists) {
    const data = doc.data();
    console.log(`${data.cookieCount} cookies synced at ${data.lastSync}`);
    return data.cookies;
  }
}

getDepopCookies().then(cookies => {
  // Use cookies for authenticated requests
  console.log('Access Token:', cookies.access_token.value);
});
```

#### Python with Firebase Admin SDK

```python
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred)

db = firestore.client()

def get_depop_cookies():
    doc = db.collection('depop_cookies').document('default').get()

    if doc.exists:
        data = doc.to_dict()
        print(f"{data['cookieCount']} cookies synced")
        return data['cookies']

cookies = get_depop_cookies()
access_token = cookies['access_token']['value']

# Use with requests
import requests
response = requests.get('https://www.depop.com/', cookies={
    'access_token': access_token,
    'user_id': cookies['user_id']['value']
})
```

#### JavaScript (Browser/Web App)

```javascript
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB3jOX9TbDxQtFq9SWBCRCE-EvF7_hpyYw",
  projectId: "closet-da8f2",
  // ... other config
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function getDepopCookies() {
  const docRef = doc(db, 'depop_cookies', 'default');
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    return data.cookies;
  }
}

// Use cookies
getDepopCookies().then(cookies => {
  console.log('Access Token:', cookies.access_token.value);
});
```

---

## File Structure

```
depop-auth-extension/
├── manifest.json          # Extension config with Firebase permissions
├── background.js          # Service worker with Firebase sync logic
├── popup.html            # Extension popup UI
├── popup.js              # Popup interaction + Firebase handlers
├── styles.css            # UI styling with Firebase sync section
├── firebase-config.js    # Firebase SDK configuration
├── firebase-sync.js      # Firebase Firestore sync module
└── README.md             # This file
```

---

## Debugging

### Check Service Worker Console

1. Go to `chrome://extensions/`
2. Find "Depop Auth Cookie Capture"
3. Click **Inspect views: service worker**
4. Console shows:
   ```
   [Firebase Sync] Initialized successfully
   Extension installed, capturing existing Depop cookies...
   Stored cookie: access_token
   [Background] Synced to Firebase: { success: true, count: 45 }
   ```

### Check Firebase Firestore

1. Go to [Firebase Console](https://console.firebase.google.com/project/closet-da8f2/firestore)
2. Navigate to `depop_cookies` collection
3. Check `default` document
4. Verify `cookies` object and `lastSync` timestamp

### Check Local Storage

1. In service worker console → **Application** tab
2. **Storage → Local Storage → Extension ID**
3. See all `depop_cookie_*` entries
4. See `firebaseSync` settings

### Common Issues

**"No cookies captured"**
- Ensure you're logged into Depop
- Try manual capture: **📸 Capture Cookies Now**
- Check service worker console for errors

**"Firebase sync failed"**
- Check internet connection
- Verify Firestore rules allow write access
- Check service worker console for detailed error
- Ensure Firebase project `closet-da8f2` is active

**"Cookies not syncing automatically"**
- Verify Auto-sync toggle is ON
- Check `firebaseSync.enabled` in chrome.storage.local
- Manual sync once to test: **⬆️ Sync to Firebase**

**"Downloaded cookies don't work"**
- Check cookies haven't expired (session cookies expire on logout)
- Verify domain/path matches (`www.depop.com` vs `.depop.com`)
- Some httpOnly cookies can't be set via JavaScript

---

## Security Considerations

### ⚠️ CRITICAL WARNINGS

1. **Plaintext Storage**:
   - Cookies stored in chrome.storage.local are NOT encrypted
   - Firestore data is also unencrypted (but access-controlled)
   - Treat cookies like passwords - anyone with access can hijack your session

2. **Firebase Security Rules**:
   - Currently set to `allow read, write: if true` (OPEN ACCESS)
   - **DO NOT USE IN PRODUCTION** without proper authentication
   - TODO: Add Firebase Auth to extension or use Cloud Function API

3. **Session Hijacking**:
   - Stolen `access_token` allows full account access
   - Don't share exported cookies
   - Don't commit cookies to version control

4. **Cross-Site Scripting (XSS)**:
   - Malicious extensions could read chrome.storage.local
   - Only install from trusted sources

### Recommended Security Improvements

#### 1. Add Firebase Authentication

```javascript
// In background.js
import { getAuth, signInAnonymously } from 'firebase/auth';

const auth = getAuth(app);
await signInAnonymously(auth);
```

Then update Firestore rules:
```javascript
match /depop_cookies/{userId} {
  allow read, write: if request.auth != null;
}
```

#### 2. Encrypt Cookies Before Storage

```javascript
// Use Web Crypto API
async function encryptCookie(value, key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ... },
    key,
    data
  );
  return encrypted;
}
```

#### 3. Use Cloud Function as Proxy

```javascript
// Cloud Function
exports.syncCookies = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new Error('Unauthorized');

  await db.collection('depop_cookies')
    .doc(context.auth.uid)
    .set({ cookies: data.cookies });
});
```

---

## Legal Disclaimer

⚠️ **Using this extension may violate Depop's Terms of Service.**

### Acceptable Use:
- ✅ Personal automation of your own account
- ✅ Educational purposes
- ✅ Testing/development

### Prohibited:
- ❌ Scraping Depop at scale
- ❌ Accessing other users' accounts
- ❌ Violating rate limits
- ❌ Commercial redistribution
- ❌ Bypassing security measures

**Use at your own risk.** You are responsible for compliance with Depop's ToS and local laws.

---

## Roadmap

Planned features:

- [ ] Firebase Authentication integration
- [ ] Cookie encryption (AES-256)
- [ ] Multi-account support (switch between accounts)
- [ ] Cookie expiration notifications
- [ ] Auto-refresh expired sessions
- [ ] Export to multiple formats (CSV, Netscape, Postman)
- [ ] Import cookies from file
- [ ] Sync to multiple Firebase projects
- [ ] Cloud Function API endpoint
- [ ] Chrome extension store publishing (after security review)

---

## Technical Details

- **Manifest Version**: 3
- **Permissions**: `cookies`, `storage`
- **Host Permissions**: `*://*.depop.com/*`, `*://*.googleapis.com/*`, `*://*.firebaseio.com/*`
- **Service Worker**: ES6 modules enabled
- **Firebase SDK**: v10.7.1 (loaded from CDN)
- **Firebase Project**: closet-da8f2
- **Firestore Collection**: depop_cookies
- **Storage**: chrome.storage.local + Firestore

---

## Development

### Building from Source

```bash
# Clone the extension
cd depop-auth-extension

# No build step required (vanilla JS)

# Load in Chrome
# chrome://extensions/ → Developer mode → Load unpacked
```

### Testing Firebase Sync

```bash
# 1. Capture cookies by logging into Depop
# 2. Enable Auto-sync in extension
# 3. Check Firestore console:
open https://console.firebase.google.com/project/closet-da8f2/firestore

# 4. Verify document exists:
# depop_cookies/default
```

### Updating Firebase Config

If you want to use your own Firebase project:

1. Create Firebase project at https://console.firebase.google.com
2. Enable Firestore Database
3. Get web app config from Project Settings
4. Update `firebase-config.js`:

```javascript
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  projectId: "YOUR_PROJECT_ID",
  // ... other config
};
```

5. Deploy Firestore rules:

```bash
firebase deploy --only firestore:rules
```

---

## Support

For issues:
1. Check **Debugging** section above
2. Check service worker console logs
3. Verify Firestore rules in Firebase Console
4. Test with manual sync buttons

This is an unofficial, educational project. Not affiliated with Depop.

---

## License

For personal use only. Not for commercial redistribution.

---

**Built with**: Chrome Extensions API, Firebase Firestore, ES6 Modules
**Project**: closet-da8f2
**Last Updated**: December 1, 2025
