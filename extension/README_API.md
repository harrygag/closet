# API Server Setup

The Chrome extension needs an API server to save marketplace credentials to your database.

## Quick Start

### 1. Install API Server Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment Variables

Make sure your `.env` file (in the root directory) has:

```
VITE_SUPABASE_URL=https://hqmujfbifgpcyqmpuwil.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
API_PORT=3001
```

**IMPORTANT:** Get your `SUPABASE_SERVICE_KEY` from:
1. Go to https://supabase.com/dashboard/project/hqmujfbifgpcyqmpuwil
2. Settings → API
3. Copy the `service_role` key (NOT the anon key)

### 3. Start the API Server

From the `server/` directory:

```bash
npm start
```

Or from the root directory:

```bash
cd server && npm start
```

You should see:

```
🚀 API Server running on http://localhost:3001
📡 Extension endpoint: http://localhost:3001/api/marketplace/save-credentials
```

### 4. Update Extension Configuration

The extension is already configured to use `http://localhost:5173` for the API, but the requests are proxied to port 3001.

If you need to change the API URL:

1. Edit `extension/background.js`
2. Find `const API_BASE_URL = 'http://localhost:5173';`
3. Change to your production URL when deploying

## Running Both Servers

You need to run TWO servers:

1. **Vite dev server** (port 5173) - for the frontend app
2. **API server** (port 3001) - for the extension API

### Option A: Two Terminal Windows

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - API Server:**
```bash
cd server
npm start
```

### Option B: Use Concurrently (Recommended)

Add to root `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "api": "cd server && npm start",
    "dev:all": "concurrently \"npm run dev\" \"npm run api\""
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

Then install and run:

```bash
npm install concurrently --save-dev
npm run dev:all
```

## API Endpoints

### POST /api/marketplace/save-credentials

Save marketplace cookies from extension.

**Headers:**
```
Authorization: Bearer {user_access_token}
Content-Type: application/json
```

**Body:**
```json
{
  "marketplace": "ebay",
  "cookies": [...],
  "email": "user@example.com",
  "autoSynced": true
}
```

### GET /api/marketplace/credentials

Get all marketplace credentials for authenticated user.

**Headers:**
```
Authorization: Bearer {user_access_token}
```

### DELETE /api/marketplace/credentials/:marketplace

Delete credentials for a specific marketplace.

**Headers:**
```
Authorization: Bearer {user_access_token}
```

### GET /api/health

Health check endpoint.

## Testing the API

### Test with curl:

```bash
# Health check
curl http://localhost:3001/api/health

# Save credentials (replace TOKEN with your actual token)
curl -X POST http://localhost:3001/api/marketplace/save-credentials \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "marketplace": "ebay",
    "cookies": [{"name":"test","value":"123","domain":".ebay.com","path":"/","secure":true,"httpOnly":false}],
    "email": "test@example.com"
  }'
```

## Production Deployment

For production, you'll want to:

1. Deploy the API server to a hosting service (e.g., Railway, Heroku, Vercel)
2. Update the extension's `API_BASE_URL` to your production URL
3. Enable CORS for your production domain
4. Use HTTPS for all requests

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure `.env` file exists in root directory
- Verify `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set
- Restart the API server after updating `.env`

### "EADDRINUSE: address already in use"
- Port 3001 is already in use
- Kill the process: `npx kill-port 3001`
- Or change the port in `.env`: `API_PORT=3002`

### "Invalid auth token" from extension
- Make sure you're using the correct access token
- Token should start with `eyJ...`
- Get a fresh token from the app (see INSTALLATION.md)

### CORS errors
- Make sure API server is running
- Check that the extension's origin is allowed in `api.js`
- Check browser console for detailed error messages

