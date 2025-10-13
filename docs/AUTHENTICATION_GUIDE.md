# Authentication System Guide

## Overview

Your Virtual Closet Arcade app uses **passwordless authentication with magic links**. This provides excellent security and UX, especially for mobile users.

## How It Works

```
User enters email → Magic link sent → User clicks link → Session created → Authenticated!
```

### Key Features

- **No passwords** - Users never create or remember passwords
- **Secure** - Magic links expire after 15 minutes and work only once
- **Mobile-first** - Perfect for mobile devices (no typing complex passwords)
- **Session management** - Users can view and revoke sessions across devices
- **HTTP-only cookies** - Session tokens stored securely, not accessible to JavaScript

---

## Database Schema

### `User` Model
```prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  name        String?
  phone       String?
  avatar      String?
  role        UserRole @default(SELLER)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  lastLoginAt DateTime?

  magicLinks  MagicLink[]
  sessions    Session[]
}
```

### `MagicLink` Model
```prisma
model MagicLink {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique // 64-char hex token
  email     String
  createdAt DateTime @default(now())
  expiresAt DateTime // 15 minutes from creation
  usedAt    DateTime? // Null until used
  ipAddress String?
  userAgent String?
}
```

### `Session` Model
```prisma
model Session {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  token        String   @unique // 64-char hex token
  createdAt    DateTime @default(now())
  expiresAt    DateTime // 30 days from creation
  lastActiveAt DateTime @default(now())
  ipAddress    String?
  userAgent    String?
  deviceInfo   String? // "Mobile - Chrome on iOS"
}
```

---

## API Endpoints

### 1. Request Magic Link

**POST** `/api/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "redirectTo": "/dashboard" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Magic link sent to your email",
  "email": "user@example.com",
  "expiresInMinutes": 15
}
```

**What happens:**
1. Finds or creates user with that email
2. Generates cryptographically secure token (64 chars)
3. Creates `MagicLink` record in database
4. Sends email with link to user
5. Magic link format: `https://yourapp.com/api/auth/verify?token=xxx`

---

### 2. Verify Magic Link

**GET** `/api/auth/verify?token=xxx&redirectTo=/dashboard`

**What happens:**
1. Validates token exists and hasn't been used
2. Checks token hasn't expired (15min limit)
3. Marks `MagicLink` as used
4. Creates new `Session` (30-day expiry)
5. Sets HTTP-only cookie `session_token`
6. Redirects user to `redirectTo` URL

**Error redirects:**
- `/login?error=missing_token` - No token provided
- `/login?error=invalid_token` - Token not found
- `/login?error=token_already_used` - Link already clicked
- `/login?error=token_expired` - Link older than 15 minutes
- `/login?error=server_error` - Server issue

---

### 3. Get Current User

**GET** `/api/auth/me`

**Headers:**
```
Cookie: session_token=xxx
```

**Response:**
```json
{
  "user": {
    "id": "clxxx...",
    "email": "user@example.com",
    "name": "John Doe",
    "phone": "+1234567890",
    "avatar": "https://...",
    "role": "SELLER",
    "createdAt": "2025-10-13T...",
    "lastLoginAt": "2025-10-13T..."
  }
}
```

**Error Response (401):**
```json
{
  "error": "Not authenticated"
}
```

---

### 4. Logout

**POST** `/api/auth/logout`

**Headers:**
```
Cookie: session_token=xxx
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**What happens:**
1. Deletes session from database
2. Clears `session_token` cookie
3. User is logged out

---

### 5. List Active Sessions

**GET** `/api/auth/sessions`

**Headers:**
```
Cookie: session_token=xxx
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "session_123",
      "deviceInfo": "Mobile - Chrome on iOS",
      "ipAddress": "192.168.1.1",
      "createdAt": "2025-10-13T10:00:00Z",
      "lastActiveAt": "2025-10-13T15:30:00Z",
      "expiresAt": "2025-11-12T10:00:00Z",
      "isCurrent": true
    },
    {
      "id": "session_456",
      "deviceInfo": "Desktop - Firefox on macOS",
      "ipAddress": "192.168.1.2",
      "createdAt": "2025-10-10T08:00:00Z",
      "lastActiveAt": "2025-10-12T12:00:00Z",
      "expiresAt": "2025-11-09T08:00:00Z",
      "isCurrent": false
    }
  ]
}
```

---

### 6. Revoke Specific Session

**DELETE** `/api/auth/sessions?id=session_456`

**Response:**
```json
{
  "success": true,
  "message": "Session revoked"
}
```

---

### 7. Revoke All Other Sessions

**POST** `/api/auth/sessions` (revoke all except current)

**Response:**
```json
{
  "success": true,
  "message": "Revoked 3 session(s)",
  "count": 3
}
```

---

## Authentication Middleware

### Protecting Routes with `requireAuth`

```typescript
import { requireAuth } from '@/src/lib/auth';

export async function POST(request: NextRequest) {
  // Require authentication
  const currentUser = await requireAuth(request);

  // currentUser is guaranteed to exist here
  // If not authenticated, 401 error is thrown

  console.log(currentUser.id); // clxxx...
  console.log(currentUser.email); // user@example.com
  console.log(currentUser.role); // SELLER | MANAGER | ADMIN
}
```

### Protecting Routes with `requireRole`

```typescript
import { requireRole } from '@/src/lib/auth';

export async function POST(request: NextRequest) {
  // Only allow MANAGER and ADMIN roles
  const currentUser = await requireRole(request, ['MANAGER', 'ADMIN']);

  // If user is SELLER, 403 error is thrown
}
```

### Optional Authentication with `getCurrentUser`

```typescript
import { getCurrentUser } from '@/src/lib/auth';

export async function GET(request: NextRequest) {
  // Get user if authenticated, null otherwise
  const currentUser = await getCurrentUser(request);

  if (currentUser) {
    console.log('Authenticated as:', currentUser.email);
  } else {
    console.log('Not authenticated, showing public data');
  }
}
```

---

## Email Provider Setup

### Option 1: Resend (Recommended)

**Free Tier:** 100 emails/day, 3,000 emails/month

1. Sign up at https://resend.com
2. Get API key from https://resend.com/api-keys
3. Add to `.env`:
   ```bash
   RESEND_API_KEY="re_..."
   EMAIL_FROM="Virtual Closet Arcade <noreply@yourdomain.com>"
   ```

4. Verify your domain (optional but recommended for production):
   - Add DNS records Resend provides
   - Once verified, your emails won't go to spam

**Email Template:**
The magic link email has:
- Beautiful gradient design matching your app
- Clear CTA button
- Security notice
- 15-minute expiration warning
- Responsive mobile design

---

### Option 2: Development Mode (No API Key)

If `RESEND_API_KEY` is not set, magic links are logged to console:

```
==============================================
🔐 MAGIC LINK (Development Mode)
==============================================
Email: user@example.com
Link: http://localhost:3000/api/auth/verify?token=abc123...
Expires in: 15 minutes
==============================================
```

This is perfect for local development - just copy the link from console and paste into browser.

---

## Security Features

### 1. Token Security
- **Cryptographically random** - Uses `crypto.randomBytes(32)` (64 hex chars)
- **Single-use** - Token marked as `usedAt` after first use
- **Short expiry** - 15 minutes for magic links, 30 days for sessions
- **Unpredictable** - 2^256 possible tokens (impossible to brute force)

### 2. Cookie Security
- **HTTP-only** - Not accessible to JavaScript (prevents XSS attacks)
- **SameSite=Lax** - Protects against CSRF attacks
- **Secure flag** - HTTPS-only in production

### 3. Session Management
- **Auto-refresh** - `lastActiveAt` updated on each request
- **Device tracking** - See all active sessions per device
- **Remote logout** - Revoke specific sessions from other devices
- **Automatic cleanup** - Expired sessions cleaned up via cron

### 4. Rate Limiting (Coming Soon)
- Limit magic link requests per email (5 per hour)
- Prevent brute force token guessing
- IP-based rate limiting

---

## Usage Examples

### Frontend Login Flow

```typescript
// app/login/page.tsx
const handleLogin = async (email: string) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (response.ok) {
    // Show "Check your email!" message
    setEmailSent(true);
  }
};
```

### Check Authentication Status

```typescript
// app/dashboard/page.tsx
useEffect(() => {
  const checkAuth = async () => {
    const response = await fetch('/api/auth/me');

    if (!response.ok) {
      // Not authenticated - redirect to login
      router.push('/login');
      return;
    }

    const { user } = await response.json();
    setUser(user);
  };

  checkAuth();
}, []);
```

### Logout

```typescript
const handleLogout = async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  router.push('/login');
};
```

---

## Cron Jobs & Maintenance

### Cleanup Expired Auth Tokens

Run this periodically (daily) to remove expired sessions and magic links:

```typescript
// app/api/cron/cleanup-auth/route.ts
import { cleanupExpiredAuth } from '@/src/lib/auth';

export async function GET(request: NextRequest) {
  // Check cron auth token
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await cleanupExpiredAuth();

  return NextResponse.json({ success: true });
}
```

**Vercel Cron (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-auth",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Or use https://cron-job.org to hit your endpoint daily.

---

## Migration Guide

Run Prisma migrations to add the new auth tables:

```bash
# Generate migration
npx prisma migrate dev --name add_auth_tables

# Apply to production
npx prisma migrate deploy
```

---

## Testing

### Test Magic Link Flow

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Go to http://localhost:3000/login

3. Enter email and click "Send Magic Link"

4. Check console for magic link (if no RESEND_API_KEY set)

5. Copy link and paste in browser

6. Should redirect to /dashboard with session cookie set

### Test API with cURL

**Request magic link:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**Get current user:**
```bash
curl http://localhost:3000/api/auth/me \
  -H "Cookie: session_token=YOUR_TOKEN"
```

**Logout:**
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Cookie: session_token=YOUR_TOKEN"
```

---

## Troubleshooting

### Magic link not received
- Check spam folder
- Verify `RESEND_API_KEY` is correct
- Check console logs for errors
- In development, check terminal for logged link

### "Invalid token" error
- Link may have expired (15min limit)
- Link may have been used already
- Request a new magic link

### Session expired
- Sessions last 30 days
- Request new magic link to create new session

### Can't authenticate API requests
- Ensure `session_token` cookie is sent with requests
- Check cookie isn't expired
- Verify cookie domain matches your app domain

---

## Production Deployment Checklist

- [ ] Set `RESEND_API_KEY` in Vercel environment variables
- [ ] Verify email domain with Resend
- [ ] Set `NEXT_PUBLIC_APP_URL` to production URL
- [ ] Enable HTTPS (automatic on Vercel)
- [ ] Set up cron job for cleanup
- [ ] Test magic link flow end-to-end
- [ ] Monitor email delivery rates
- [ ] Set up error tracking (Sentry)

---

## FAQs

**Q: Why no passwords?**
A: Passwordless auth is more secure (no password leaks) and better UX (no forgotten passwords).

**Q: What if someone accesses my email?**
A: Same risk as password reset flow. Use 2FA on your email account.

**Q: Can I add social login (Google, Apple)?**
A: Yes! The session system supports any auth method. Just create a session after OAuth callback.

**Q: How do I test locally without email?**
A: Magic links are logged to console when `RESEND_API_KEY` is not set.

**Q: Can users have multiple active sessions?**
A: Yes! They can be logged in on phone, tablet, desktop simultaneously. Each device gets its own session.

**Q: How do I add role-based access control?**
A: Use `requireRole(request, ['MANAGER', 'ADMIN'])` middleware.

---

## Resources

- **Resend Docs:** https://resend.com/docs
- **Prisma Sessions:** https://www.prisma.io/docs/guides/other/session-management
- **Magic Links Best Practices:** https://workos.com/blog/a-guide-to-magic-links

---

**Next Steps:**
- Read the [Vercel Deployment Guide](./VERCEL_DEPLOYMENT.md) to deploy your app
- Check out [Marketplace Integration Guide](./MARKETPLACE_INTEGRATION_GUIDE.md) for multi-marketplace publishing
