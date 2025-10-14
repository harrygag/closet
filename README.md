# Virtual Closet Arcade 🎮

> AI-Powered Clothing Inventory Tracker & Analytics Platform

[![Next.js](https://img.shields.io/badge/Next.js-15.5.5-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.17.0-2D3748)](https://www.prisma.io/)
[![OpenAI](https://img.shields.io/badge/OpenAI-gpt--4o--mini-412991)](https://openai.com/)

## Overview

Virtual Closet Arcade is an AI-powered platform for managing clothing inventory with intelligent pricing, condition analysis, and profit tracking. Perfect for resellers, collectors, and anyone managing a clothing inventory.

### Key Features

- **📦 Smart Inventory Tracking**
  - Track purchase dates, costs, and sale prices
  - Monitor profit margins per item
  - Item status tracking (in stock, listed, sold, etc.)
  - Notes and custom fields

- **🤖 AI-Powered Analysis**
  - Intelligent pricing suggestions based on market data
  - Automated condition grading with defect detection
  - Brand normalization and tag generation
  - Listing title/description generation

- **🔍 Semantic Search**
  - Vector embeddings via pgvector
  - Find similar items instantly
  - Smart recommendations
  - Duplicate detection

- **📊 Analytics & Insights**
  - Track AI costs and token usage
  - Profit/loss by item, brand, category
  - Inventory value tracking
  - Export to CSV

- **📋 Review Queue**
  - Human-in-the-loop review workflow
  - Automatic issue creation for low-confidence AI suggestions
  - Manager approval system with audit trails

- **🔐 Passwordless Authentication**
  - Magic link sign-in (no passwords!)
  - Session management across devices
  - Secure HTTP-only cookies

- **📱 Mobile-First Design**
  - Responsive gradient UI
  - Optimized for touch devices
  - Fast loading times

---

## Quick Start

### 1. Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** 14+ with pgvector extension
- **OpenAI API Key** (https://platform.openai.com/api-keys)
- **Linear API Key** (optional, https://linear.app/settings/api)
- **Resend API Key** (optional, 100 free emails/day, https://resend.com)

### 2. Installation

```bash
# Clone repository
git clone https://github.com/harrygag/closet.git
cd closet

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

### 3. Database Setup

```bash
# Create PostgreSQL database with pgvector
psql -U postgres
CREATE DATABASE closet_dev;
\c closet_dev
CREATE EXTENSION IF NOT EXISTS vector;
\q

# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

### 4. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000

---

## Environment Variables

Required variables in `.env`:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/closet_dev"

# OpenAI (Required)
OPENAI_API_KEY="sk-..."
OPENAI_CHAT_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-large"

# Email (Optional - logs to console if not set)
RESEND_API_KEY="re_..."
EMAIL_FROM="Virtual Closet Arcade <noreply@yourdomain.com>"

# Linear MCP (Optional)
LINEAR_API_KEY="lin_api_..."

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

See [.env.example](.env.example) for complete configuration.

---

## Architecture

### Tech Stack

- **Framework:** Next.js 15.5.5 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL with pgvector
- **ORM:** Prisma
- **AI:** OpenAI (gpt-4o-mini, text-embedding-3-large)
- **Auth:** Passwordless (magic links)
- **Email:** Resend
- **MCP:** Linear integration
- **Deployment:** Vercel

### Database Models

- **User** - User accounts with token budgets
- **Item** - Clothing items with AI analysis and inventory tracking
- **AIJob** - AI processing jobs (pricing, condition, etc.)
- **Session** - User authentication sessions
- **MagicLink** - One-time sign-in tokens
- **Tag** - Normalized tags for categorization
- **AILog** - AI usage and cost tracking
- **LinearSync** - Linear MCP issue tracking

See [prisma/schema.prisma](prisma/schema.prisma) for complete schema.

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Request magic link |
| GET | `/api/auth/verify` | Verify token & create session |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/sessions` | List active sessions |

### AI Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/aijobs` | Create AI job |
| GET | `/api/aijobs` | List user's jobs |
| POST | `/api/aijobs/process` | Worker: Process pending jobs |
| POST | `/api/aijobs/[id]/apply` | Apply AI suggestion to item |

---

## Usage Examples

### 1. Sign In

Visit http://localhost:3000/login

Enter your email → Click "Send Magic Link" → Check email (or console in dev mode) → Click link → Authenticated!

### 2. Create AI Job for Pricing

```bash
curl -X POST http://localhost:3000/api/aijobs \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=YOUR_TOKEN" \
  -d '{
    "jobType": "PRICE_SUGGESTION",
    "inputPayload": {
      "title": "Nike Air Jordan 1 Retro High OG",
      "brand": "Nike",
      "category": "sneakers",
      "condition": "Good",
      "images": ["https://..."]
    }
  }'
```

### 3. Track Inventory Item

```typescript
// Create item with purchase tracking
const item = await prisma.item.create({
  data: {
    userId: currentUser.id,
    title: "Vintage Levi's 501 Jeans",
    brand: "Levi's",
    category: "bottoms",
    size: "32x34",
    purchaseDate: new Date(),
    purchasePriceCents: 2000, // $20
    status: "IN_STOCK",
  },
});

// Later: mark as sold
await prisma.item.update({
  where: { id: item.id },
  data: {
    status: "SOLD",
    soldDate: new Date(),
    soldPriceCents: 5500, // $55
    soldPlatform: "eBay",
  },
});

// Profit: $55 - $20 = $35
```

---

## AI Job Types

### NORMALIZE
Standardizes brand names, generates tags, and normalizes attributes.

**Input:**
```json
{
  "title": "vtg 90s nike air max shoes sz 10",
  "brand": "nike",
  "category": "sneakers"
}
```

**Output:**
```json
{
  "brand_normalized": "Nike",
  "tags": ["vintage", "90s", "Air Max", "athletic"],
  "subcategory": "running shoes"
}
```

### PRICE_SUGGESTION
Suggests price range based on comparable items.

**Input:**
```json
{
  "title": "Supreme Box Logo Hoodie",
  "brand": "Supreme",
  "condition": "Excellent",
  "size": "L"
}
```

**Output:**
```json
{
  "suggestedMinCents": 45000,
  "suggestedMedianCents": 55000,
  "suggestedMaxCents": 75000,
  "confidence": 0.85,
  "reasoning": ["High demand brand", "Popular item", "Good condition"]
}
```

### CONDITION_GRADE
Analyzes condition and detects defects.

**Input:**
```json
{
  "images": ["https://..."],
  "description": "Some wear on collar"
}
```

**Output:**
```json
{
  "grade": "Good",
  "confidence": 0.90,
  "defects": [
    {
      "type": "wear",
      "severity": "minor",
      "location": "collar",
      "description": "Light pilling on collar"
    }
  ]
}
```

### GENERATE_EMBEDDING
Creates vector embedding for semantic search.

**Input:**
```json
{
  "title": "Vintage Nike Windbreaker Jacket",
  "brand": "Nike",
  "description": "Classic 90s windbreaker..."
}
```

**Output:** 1536-dimensional vector stored in database

---

## Semantic Search Example

```typescript
// Find similar items using vector embeddings
const query = "vintage nike jacket 90s";

// Generate embedding for query
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-large",
  input: query,
});

// Search with pgvector
const similar Items = await prisma.$queryRaw`
  SELECT id, title, brand,
    1 - (embedding <=> ${embedding.data[0].embedding}::vector) AS similarity
  FROM "Item"
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> ${embedding.data[0].embedding}::vector
  LIMIT 10
`;
```

---

## Documentation

- **[Authentication Guide](docs/AUTHENTICATION_GUIDE.md)** - Passwordless auth with magic links
- **[Vercel Deployment](docs/VERCEL_DEPLOYMENT.md)** - Deploy to production

---

## Development

### Run Tests

```bash
npm test
```

### Database Migrations

```bash
# Create migration
npx prisma migrate dev --name your_migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (development only!)
npx prisma migrate reset
```

### View Database

```bash
npx prisma studio
```

Opens Prisma Studio at http://localhost:5555

---

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import repository in Vercel dashboard
3. Set environment variables
4. Deploy!

See [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md) for detailed guide.

### Environment Variables (Production)

Required in Vercel:
- `DATABASE_URL` - PostgreSQL connection string (Supabase/Neon)
- `OPENAI_API_KEY` - OpenAI API key
- `RESEND_API_KEY` - Email API key (optional)
- `LINEAR_API_KEY` - 
- `NEXT_PUBLIC_APP_URL` - Production URL
- `AI_WORKER_SERVICE_TOKEN` - Worker auth token

---

## Contributing

This is a personal project, but feel free to fork and customize for your own use!

---

## License

MIT

---

## Support

- **Issues:** https://github.com/harrygag/closet/issues
- **Docs:** Check the `docs/` folder

---

## Roadmap

- [ ] Mobile app (React Native)
- [ ] Barcode scanning for quick item entry
- [ ] Bulk CSV import for existing inventory
- [ ] Image upload with S3
- [ ] Analytics dashboard (sales, profit, ROI)
- [ ] Automated repricing based on market trends
- [ ] Multi-user teams with role-based permissions
- [ ] Public API with rate limiting
- [ ] Marketplace integrations (optional add-on)

---

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- AI powered by [OpenAI](https://openai.com/)
- Email by [Resend](https://resend.com/)
- Database by [Prisma](https://www.prisma.io/)
- Deployed on [Vercel](https://vercel.com/)

---

**Made with ❤️ and Claude Code**

🎮 Happy tracking!
