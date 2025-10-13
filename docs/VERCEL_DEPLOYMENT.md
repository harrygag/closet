# Vercel Deployment Guide 🚀

Complete guide to deploy your AI-powered reseller platform to Vercel.

---

## Prerequisites

- GitHub account with this repository
- Vercel account (sign up at https://vercel.com)
- OpenAI API key
- PostgreSQL database (Supabase recommended)

---

## Step 1: Prepare Database

### Option A: Supabase (Recommended - Free Tier)

1. Go to https://supabase.com
2. Create new project
3. Go to **SQL Editor**
4. Run this SQL:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
5. Go to **Settings** → **Database**
6. Copy **Connection String** (Transaction mode)
7. Save for Step 3

### Option B: Neon

1. Go to https://neon.tech
2. Create project
3. Enable pgvector in Extensions
4. Copy connection string

---

## Step 2: Deploy to Vercel

### Via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your GitHub repository: `harrygag/closet`
3. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `prisma generate && next build`
   - **Install Command**: `npm install`

4. Click **Deploy** (it will fail - that's expected, we need to add env vars)

### Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel
```

---

## Step 3: Configure Environment Variables

In Vercel Dashboard → Your Project → **Settings** → **Environment Variables**

Add these variables for **all environments** (Production, Preview, Development):

### Required Variables

```bash
# Database
DATABASE_URL="your_postgresql_connection_string_from_step_1"

# OpenAI
OPENAI_API_KEY="sk-..." # Get from https://platform.openai.com/api-keys
OPENAI_CHAT_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-large"
OPENAI_TEMPERATURE_STRUCTURED="0.0"
OPENAI_TEMPERATURE_CREATIVE="0.3"

# Linear
LINEAR_API_KEY="lin_api_..." # Your Linear API key

# Worker Authentication
AI_WORKER_SERVICE_TOKEN="generate_a_random_secret_here"
```

### How to Generate Secrets

```bash
# On Mac/Linux
openssl rand -base64 32

# On Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

### Optional Variables

```bash
# Marketplace APIs (add when ready)
EBAY_CLIENT_ID=""
EBAY_CLIENT_SECRET=""
EBAY_SANDBOX_MODE="true"

# AWS S3 (for image uploads)
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
S3_BUCKET_NAME="closet-items"

# Monitoring
SENTRY_DSN=""
LOG_LEVEL="info"
```

---

## Step 4: Run Database Migrations

After adding environment variables, you need to run Prisma migrations.

### Option A: Via Vercel CLI

```bash
# Set DATABASE_URL locally
export DATABASE_URL="your_postgresql_connection_string"

# Run migration
npx prisma migrate deploy

# Verify
npx prisma studio
```

### Option B: Via Supabase SQL Editor

Go to Supabase → SQL Editor and run the migration SQL from `prisma/migrations/`.

---

## Step 5: Redeploy

In Vercel Dashboard:
1. Go to **Deployments**
2. Click **...** on latest deployment
3. Click **Redeploy**
4. Wait for build to complete

Or via CLI:
```bash
vercel --prod
```

---

## Step 6: Test Your Deployment

### Check Homepage

Visit: `https://your-project.vercel.app`

Should see the Virtual Closet Arcade landing page with:
- ✅ API Status: Online
- ✅ Available Endpoints listed

### Test API Endpoint

```bash
# Test health
curl https://your-project.vercel.app/api/aijobs

# Should return: {"jobs":[],"total":0,...}
```

### Test Worker (Optional)

```bash
curl -X POST https://your-project.vercel.app/api/aijobs/process \
  -H "Authorization: Bearer YOUR_AI_WORKER_SERVICE_TOKEN" \
  -H "Content-Type: application/json"

# Should return: {"message":"No jobs to process","processed":0}
```

---

## Step 7: Set Up Cron Job for Worker

Vercel doesn't support cron in free tier, but you can use external services:

### Option A: GitHub Actions (Free)

Create `.github/workflows/worker-cron.yml`:

```yaml
name: AI Worker Cron

on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes

jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Worker
        run: |
          curl -X POST https://your-project.vercel.app/api/aijobs/process \
            -H "Authorization: Bearer ${{ secrets.AI_WORKER_SERVICE_TOKEN }}" \
            -H "Content-Type: application/json"
```

Add `AI_WORKER_SERVICE_TOKEN` to GitHub Secrets:
1. Repository → Settings → Secrets → Actions
2. Add secret

### Option B: Cron-job.org (Free)

1. Go to https://cron-job.org
2. Create account
3. Add new cron job:
   - URL: `https://your-project.vercel.app/api/aijobs/process`
   - Schedule: `*/5 * * * *` (every 5 minutes)
   - Headers: `Authorization: Bearer YOUR_TOKEN`

### Option C: Vercel Cron (Pro Plan Only)

In `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/aijobs/process",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

---

## Step 8: Monitor Your Deployment

### Vercel Dashboard

- Go to **Analytics** to see requests
- Go to **Logs** to see function logs
- Go to **Usage** to track bandwidth

### Database

- Use Prisma Studio locally: `npx prisma studio`
- Or use Supabase Table Editor

### OpenAI Usage

- Check costs at https://platform.openai.com/usage

---

## Troubleshooting

### Build Fails with "Prisma generate failed"

**Solution:**
```bash
# Ensure prisma is in dependencies (not devDependencies)
npm install @prisma/client prisma

# Verify package.json has:
"dependencies": {
  "@prisma/client": "^6.17.0"
},
"devDependencies": {
  "prisma": "^6.17.0"
}
```

### API Returns 500 Error

**Check Vercel Logs:**
1. Dashboard → Your Project → **Logs**
2. Look for errors
3. Common issues:
   - `DATABASE_URL` not set
   - Prisma Client not generated
   - OpenAI API key invalid

### Database Connection Timeout

**Solutions:**
- Use Transaction mode connection string (not Session mode)
- Example: `postgresql://user:pass@host:5432/db?pgbouncer=true&connection_limit=1`
- Add `&connection_limit=1` to DATABASE_URL

### Worker Returns 401 Unauthorized

**Check:**
- `AI_WORKER_SERVICE_TOKEN` is set in Vercel
- Token matches exactly in your request header
- Header format: `Authorization: Bearer YOUR_TOKEN`

### Prisma Migration Fails

**Run manually:**
```bash
# Set DATABASE_URL
export DATABASE_URL="..."

# Deploy migration
npx prisma migrate deploy

# If that fails, reset and migrate
npx prisma migrate reset
npx prisma migrate dev
```

---

## Production Checklist

Before going live:

### Security
- [ ] All API keys in Vercel env vars (not in code)
- [ ] `AI_WORKER_SERVICE_TOKEN` is strong random string
- [ ] Database has SSL enabled
- [ ] Rate limiting configured
- [ ] CORS configured correctly

### Database
- [ ] Migrations applied successfully
- [ ] pgvector extension installed
- [ ] Indexes created
- [ ] Backup strategy in place

### Monitoring
- [ ] Vercel Analytics enabled
- [ ] Error tracking (Sentry) set up
- [ ] Database monitoring active
- [ ] OpenAI usage alerts configured

### Performance
- [ ] Images optimized
- [ ] API routes respond < 2s
- [ ] Database queries indexed
- [ ] Caching strategy implemented

### Testing
- [ ] All API endpoints tested
- [ ] Worker processes jobs successfully
- [ ] OpenAI integration works
- [ ] Linear MCP creates issues
- [ ] Mobile responsiveness verified

---

## Scaling Considerations

### Database
- Start: Supabase Free (500MB, good for 10K items)
- Growth: Supabase Pro ($25/mo, 8GB)
- Scale: Neon or AWS RDS

### Vercel
- Start: Hobby (free, good for development)
- Growth: Pro ($20/mo, needed for cron jobs)
- Scale: Enterprise

### OpenAI
- Start: Pay-as-you-go (~$3-5/month for 10K items)
- Growth: Monitor usage, set budget alerts
- Scale: Enterprise pricing at scale

---

## Cost Estimates

### Monthly Costs (10,000 items processed)

| Service | Free Tier | Paid |
|---------|-----------|------|
| Vercel | ✅ Hobby Free | Pro $20/mo |
| Supabase | ✅ 500MB Free | Pro $25/mo |
| OpenAI | ❌ Pay-as-you-go | ~$3-5/mo |
| **Total** | **$3-5/mo** | **$48-50/mo** |

### At Scale (100,000 items/month)

| Service | Cost |
|---------|------|
| Vercel Pro | $20/mo |
| Supabase Pro | $25/mo |
| OpenAI | ~$30-50/mo |
| **Total** | **~$75-95/mo** |

---

## Post-Deployment

### Set Up Domains (Optional)

1. Vercel Dashboard → Your Project → **Settings** → **Domains**
2. Add your custom domain
3. Follow DNS configuration instructions

### Enable HTTPS

- Vercel automatically provides SSL certificates
- Force HTTPS is enabled by default

### Configure Analytics

- Vercel Analytics: Automatic
- Google Analytics: Add tracking code to `app/layout.tsx`

---

## Support

**Vercel Documentation:**
- https://vercel.com/docs

**Supabase Documentation:**
- https://supabase.com/docs

**Need Help?**
- Check Vercel Logs
- Review [ARCHITECTURE.md](./ARCHITECTURE.md)
- Test locally first with `npm run dev`

---

✅ **Your app is now live on Vercel!**

Access it at: `https://your-project.vercel.app`

Next steps:
1. Test all API endpoints
2. Set up worker cron job
3. Monitor costs and usage
4. Start processing items!

🚀 Happy deploying!
