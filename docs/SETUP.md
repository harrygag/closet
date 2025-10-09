# Closet Reseller App - Setup Guide

Complete setup guide for the AI-powered reseller closet application with Manager Workspace and Linear MCP integration.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ with pgvector extension
- Linear account with API access
- (Optional) AWS S3 or S3-compatible storage
- (Optional) Marketplace API credentials (eBay, Poshmark, etc.)

---

## Quick Start (Local Development)

```bash
# 1. Clone and install dependencies
npm install

# 2. Set up PostgreSQL with pgvector
# See "Database Setup" section below

# 3. Copy environment variables
cp .env.example .env
# Edit .env with your credentials

# 4. Run Prisma migrations
npx prisma migrate dev

# 5. Generate Prisma Client
npx prisma generate

# 6. (Optional) Seed initial data
npm run seed

# 7. Start development server
npm run dev
```

---

## Database Setup

### Option 1: Local PostgreSQL

```bash
# Install PostgreSQL (if not installed)
# macOS: brew install postgresql@15
# Ubuntu: sudo apt install postgresql-15
# Windows: Download from https://www.postgresql.org/download/windows/

# Start PostgreSQL
# macOS: brew services start postgresql@15
# Ubuntu: sudo systemctl start postgresql
# Windows: Start via Services

# Create database
psql postgres
CREATE DATABASE closet_dev;
\q

# Install pgvector extension
psql closet_dev
CREATE EXTENSION IF NOT EXISTS vector;
\q
```

### Option 2: Managed PostgreSQL (Recommended for Production)

**Supabase** (Free tier available):
1. Create project at https://supabase.com
2. Go to SQL Editor
3. Run: `CREATE EXTENSION IF NOT EXISTS vector;`
4. Copy connection string to `DATABASE_URL`

**Neon** (Serverless PostgreSQL):
1. Create project at https://neon.tech
2. Enable pgvector in Extensions
3. Copy connection string

**AWS RDS**:
1. Create PostgreSQL 15+ instance
2. Connect via psql
3. `CREATE EXTENSION IF NOT EXISTS vector;`

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Required Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/closet_dev"

# Linear MCP (REQUIRED)
LINEAR_API_KEY="lin_api_..." # Get from https://linear.app/settings/api

# Worker Auth
AI_WORKER_SERVICE_TOKEN="generate_random_secret_here"
```

### Optional Variables

```bash
# AI Models (if using external APIs)
OPENAI_API_KEY="sk-..." # For embeddings

# AWS S3
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
S3_BUCKET_NAME="closet-items"

# Marketplace APIs
EBAY_CLIENT_ID="..."
EBAY_CLIENT_SECRET="..."
```

---

## Linear MCP Setup

### 1. Get Linear API Key

1. Go to https://linear.app/settings/api
2. Click "Create new API key"
3. Name it "Closet Reseller AI Review"
4. Copy the key to `LINEAR_API_KEY` in `.env`

### 2. Test Connection

```bash
node test-linear.js
```

Expected output:
```
✅ Linear API connection successful!
👤 Viewer: { name: 'Your Name', email: '...' }
🏢 Organization: { name: '...' }
📋 Teams: ...
```

### 3. Create AI Review Team (Optional)

1. In Linear, create a new team called "AI Review"
2. Add labels: `ai-review`, `needs-approval`, `high-confidence`, `low-confidence`
3. Create a project called "AI Job Reviews"
4. Copy team ID to `LINEAR_TEAM_ID` (optional)

---

## Database Migrations

### Run Initial Migration

```bash
npx prisma migrate dev --name init
```

This creates all tables:
- User (sellers, managers, admins)
- Item (clothing items)
- AIJob (AI task pipeline)
- Prompt (versioned prompts)
- AILog (token accounting)
- ManagerAudit (action history)
- LinearSync (Linear issue tracking)
- Tag, ItemTag (normalized tags)

### Verify pgvector

```bash
psql $DATABASE_URL
\dx vector
# Should show vector extension installed

SELECT * FROM pg_extension WHERE extname = 'vector';
\q
```

---

## Prisma Client Generation

```bash
# Generate Prisma Client
npx prisma generate

# View database in Prisma Studio (optional)
npx prisma studio
# Opens browser at http://localhost:5555
```

---

## Project Structure

```
closet/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── constants/
│   │   └── categories.ts      # Pokémon→Clothing mappings
│   ├── lib/
│   │   ├── schemas.ts         # Zod validation schemas
│   │   └── linear/
│   │       ├── issue-template.ts  # Linear issue templates
│   │       └── smoke-test.ts      # Linear connection test
│   ├── api/                   # API routes (to be created)
│   ├── workers/               # AI job workers (to be created)
│   └── components/            # React components (existing)
├── .env                       # Environment variables (git-ignored)
├── .env.example               # Environment template
└── test-linear.js             # Quick Linear API test
```

---

## Verification Checklist

- [ ] PostgreSQL running and accessible
- [ ] `closet_dev` database created
- [ ] pgvector extension installed (`\dx vector` shows it)
- [ ] `.env` file created with DATABASE_URL
- [ ] `LINEAR_API_KEY` set in `.env`
- [ ] Linear connection test passes (`node test-linear.js`)
- [ ] Prisma migrations run (`npx prisma migrate dev`)
- [ ] Prisma Client generated (`npx prisma generate`)
- [ ] No errors in `npx prisma studio`

---

## Next Steps

After setup is complete:

1. **Create Seed Data** - Add test users and items
2. **Build API Routes** - Create `/api/aijobs`, `/api/items` endpoints
3. **Implement AI Worker** - Build job processing pipeline
4. **Create Manager UI** - Build dashboard and job review interface
5. **Add Prompt Templates** - Define versioned prompts for each job type

See [DEVELOPMENT.md](./DEVELOPMENT.md) for implementation roadmap.

---

## Troubleshooting

### pgvector extension not found

```bash
# Install pgvector
# Ubuntu/Debian:
sudo apt install postgresql-15-pgvector

# macOS (Homebrew):
brew install pgvector

# Then in psql:
CREATE EXTENSION IF NOT EXISTS vector;
```

### Prisma migration fails

```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Or manually drop/recreate
psql postgres
DROP DATABASE closet_dev;
CREATE DATABASE closet_dev;
\q
```

### Linear API returns 401

- Verify `LINEAR_API_KEY` is correct
- Check key hasn't expired at https://linear.app/settings/api
- Ensure no extra spaces/quotes in `.env` file

### Database connection timeout

- Check DATABASE_URL format: `postgresql://user:pass@host:port/db`
- Verify PostgreSQL is running: `pg_isready`
- Check firewall rules if using remote database

---

## Production Deployment

### Environment Setup

1. Provision PostgreSQL with pgvector (Supabase, Neon, RDS)
2. Set all environment variables in your hosting platform
3. Run migrations: `npx prisma migrate deploy`
4. Generate Prisma Client in build step

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Enable build command: npm run build && npx prisma generate
```

### Security Checklist

- [ ] `AI_WORKER_SERVICE_TOKEN` is strong random secret
- [ ] Database credentials are secure
- [ ] Linear API key has minimal required permissions
- [ ] S3 bucket has restricted IAM policies
- [ ] Rate limiting enabled on API routes
- [ ] CORS configured correctly
- [ ] SSL/TLS enforced for all connections

---

## Support

For issues or questions:
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Review [API.md](./API.md) for endpoint documentation
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design

---

✅ **Setup Complete!** You're ready to start building the AI job pipeline.
