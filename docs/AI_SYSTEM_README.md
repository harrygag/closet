# AI Manager System - Closet Reseller 🤖

AI-powered Manager Workspace with Linear MCP integration for clothing resale operations.

## Overview

This system adds an **auditable AIJob pipeline** to the Virtual Closet Arcade app, enabling:
- Automated attribute normalization
- AI-suggested pricing with deterministic baselines
- Condition grading with defect detection
- Platform-optimized listing generation
- Human-in-the-loop review via Linear MCP

---

## ✅ Completed Foundation (Phase 0)

### Database Schema
**10 production-ready Prisma models:**
- `User` - Sellers, managers, admins with token quotas
- `Item` - Clothing items with AI suggestions cached
- `AIJob` - Idempotent job pipeline with versioning
- `Prompt` - Versioned prompts with metadata
- `AILog` - Token accounting & cost tracking
- `ManagerAudit` - Immutable action history
- `LinearSync` - Linear issue state tracking
- `Tag`, `ItemTag` - Normalized tags

**Key Features:**
- pgvector extension for 1536-d embeddings
- Comprehensive indexes for performance
- JSON fields for flexible AI outputs
- Full audit trail support

### Validation Schemas (Zod)
**6 fully-defined job types:**
1. `PriceSuggestionSchema` - Price ranges with reasoning
2. `NormalizeSchema` - Standardized attributes
3. `ConditionSchema` - Condition grades + defects
4. `GenerateListingsSchema` - Platform-specific listings
5. `EmbeddingSchema` - Vector embeddings
6. `DeterministicBaselineSchema` - Comps statistics

**File:** [src/lib/schemas.ts](../src/lib/schemas.ts)

### Linear MCP Integration ✅ VERIFIED
**Components:**
- Issue template generator with smart formatting
- Smoke test verified against your Linear workspace
- Priority & label assignment logic
- Delta analysis for pricing suggestions

**Files:**
- [src/lib/linear/issue-template.ts](../src/lib/linear/issue-template.ts)
- [src/lib/linear/smoke-test.ts](../src/lib/linear/smoke-test.ts)

**Test Results:**
```
✅ Viewer: Harrison Kennedy
🏢 Organization: 444
📋 Teams: 444 (444)
```

### Pokémon → Clothing Mappings
**6 categories with arcade colors:**

| Category | Pokémon Type | Hex | Border | Glow |
|----------|--------------|-----|--------|------|
| Polos | White | #F5F5F5 | #E0E0E0 | rgba(245,245,245,0.5) |
| Hoodies | Pink | #FF69B4 | #FF1493 | rgba(255,105,180,0.5) |
| Shirts | Blue | #00BFFF | #1E90FF | rgba(0,191,255,0.5) |
| Pullovers | Red | #FF6347 | #FF4500 | rgba(255,99,71,0.5) |
| Bottoms | Orange | #FFA500 | #FF8C00 | rgba(255,165,0,0.5) |
| Jerseys | Green | #00FF00 | #32CD32 | rgba(0,255,0,0.5) |

**File:** [src/constants/categories.ts](../src/constants/categories.ts)

### Documentation
- **[SETUP.md](./SETUP.md)** - Complete installation guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design & patterns
- **[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)** - Detailed roadmap

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
# Installs: @prisma/client, prisma, tsx, zod (already in package.json)
```

### 2. Set Up PostgreSQL
```bash
# Option A: Local PostgreSQL
psql postgres
CREATE DATABASE closet_dev;
\c closet_dev
CREATE EXTENSION IF NOT EXISTS vector;
\q

# Option B: Managed (Supabase recommended)
# 1. Create project at supabase.com
# 2. SQL Editor → CREATE EXTENSION vector;
# 3. Copy connection string
```

### 3. Configure Environment
```bash
cp .env.example .env
```

**Required variables:**
```bash
DATABASE_URL="postgresql://..."
LINEAR_API_KEY="lin_api_..."  # Get from https://linear.app/settings/api
AI_WORKER_SERVICE_TOKEN="your_random_secret"
```

### 4. Run Migrations
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Verify Setup
```bash
# Test Linear connection
node test-linear.js
# Should show: ✅ Linear API connection successful!

# Open Prisma Studio
npx prisma studio
# Verify all 10 tables exist
```

---

## Architecture

### AIJob Pipeline Flow

```
1. CREATE JOB
   ↓
   Validate input → Compute inputHash → Check quota → Insert DB

2. CLAIM JOB (Worker)
   ↓
   SELECT FOR UPDATE WHERE status=PENDING

3. IDEMPOTENCY CHECK
   ↓
   If job with same inputHash exists → Copy result → Done

4. COMPUTE BASELINE
   ↓
   Query comps → Calculate stats (median, mean, std) → Persist

5. CALL AI
   ↓
   Compose prompt + baseline → Call model → Log tokens

6. VALIDATE
   ↓
   Zod schema check → Confidence threshold → Needs review?

7. DECISION
   ↓
   ├─ Success → status=SUCCEEDED
   ├─ Low confidence → status=NEEDS_REVIEW + Create Linear issue
   └─ Failure → Retry with backoff OR status=FAILED + Linear issue

8. MANAGER REVIEW (if needed)
   ↓
   Linear issue created → Manager approves in Linear → Webhook updates AIJob

9. APPLY
   ↓
   Update Item with suggestion → Log ManagerAudit → Done
```

### Deterministic Baselines

**Why?**
- Anchors AI to factual data
- Enables delta analysis
- Provides fallback if AI fails
- Auditability for manager review

**What's computed:**
```typescript
{
  median: 3000,        // cents
  mean: 3200,
  std: 500,
  count: 47,           // number of comps
  min: 1500,
  max: 6000,
  top5_comps: [
    { id, price_cents, sold_at, distance, brand, category },
    ...
  ],
  computed_at: "2025-10-09T..."
}
```

### Idempotency

Every job has:
```typescript
inputHash = SHA256(
  JSON.stringify(inputPayload) +
  promptVersion +
  jobType
)
```

**Before processing:**
1. Check if succeeded job with same `inputHash` exists
2. If yes → Copy result (no AI call needed)
3. If no → Proceed with AI call

### Linear MCP Workflow

**When issues are created:**
- AIJob status → `NEEDS_REVIEW`
- Confidence < 0.7 (configurable)
- Prompt has `mcpRequired = true`
- Any `BULK_*` job type

**Issue contents:**
- Job details (ID, type, tokens, cost)
- Deterministic baseline table
- Top-5 comps with prices
- AI suggestion (formatted JSON)
- Delta analysis (AI vs baseline)
- Action checklist

**Webhook integration:**
```
Linear Issue → "Done"
       ↓
Webhook → /api/webhooks/linear
       ↓
Update AIJob.managerApproved = true
       ↓
Manager clicks "Apply" in UI
       ↓
Transaction: Item + ManagerAudit
```

---

## API Endpoints (To Be Implemented)

### AIJob Management
```typescript
POST   /api/aijobs              // Create job
GET    /api/aijobs/:id          // Get job details
POST   /api/aijobs/process      // Worker endpoint (auth required)
POST   /api/aijobs/:id/apply    // Apply suggestion to item
POST   /api/aijobs/:id/retry    // Retry failed job
```

### Items
```typescript
POST   /api/items               // Create item + trigger AI jobs
GET    /api/items               // List with filters
GET    /api/items/:id           // Get item details
```

### Webhooks
```typescript
POST   /api/webhooks/linear     // Linear webhook handler
```

---

## Job Types

### 1. NORMALIZE
**Purpose:** Standardize item attributes
**Input:** Title, description, OCR text, barcode
**Output:**
```json
{
  "category": "polo",
  "brand_normalized": "Nike",
  "color_hex_or_name": "#FF0000",
  "tags": ["athletic", "dri-fit", "golf"],
  "confidence_scores": { "brand": 0.95, "category": 0.99 }
}
```

### 2. PRICE_SUGGESTION
**Purpose:** Suggest price range based on comps
**Input:** Category, brand, title, tags, condition
**Output:**
```json
{
  "suggestedMinCents": 2500,
  "suggestedMedianCents": 3500,
  "suggestedMaxCents": 4500,
  "confidence": 0.85,
  "reasoning": [
    "47 comparable items sold in last 60 days",
    "Median price for Nike Golf Polos in Excellent condition is $35",
    "Similar items trending +8% this month"
  ]
}
```

### 3. CONDITION_GRADE
**Purpose:** Grade condition and detect defects
**Input:** Image caption, notes, brand guidelines
**Output:**
```json
{
  "condition_grade": "Excellent",
  "defects": [
    {
      "type": "pilling",
      "severity": "minor",
      "location": "left sleeve",
      "suggested_text_for_listing": "Minor pilling on left sleeve cuff"
    }
  ],
  "confidence_score": 0.92
}
```

### 4. GENERATE_LISTINGS
**Purpose:** Create platform-optimized listings
**Input:** Item details, platforms (eBay, Poshmark, etc.)
**Output:**
```json
{
  "variants": [
    {
      "platform": "ebay",
      "title": "Nike Dri-FIT Golf Polo XL Red Excellent Condition",
      "long_desc": "...",
      "bullets": ["100% Polyester", "Moisture-wicking", "Size: XL"]
    },
    {
      "platform": "poshmark",
      "title": "✨ Nike Golf Polo - XL - Red 🔴 Excellent!",
      "long_desc": "..."
    }
  ],
  "confidence": 0.88
}
```

### 5. GENERATE_EMBEDDING
**Purpose:** Create 1536-d vector for similarity search
**Input:** Brand + title + tags + category
**Output:**
```json
{
  "embedding": [0.123, -0.456, 0.789, ...],  // 1536 dimensions
  "model": "text-embedding-3-small",
  "dimension": 1536
}
```

### 6. BULK_* (Requires Linear MCP)
**Purpose:** Process multiple items in batch
**Requirements:**
- Linear parent issue with `bulk-operation` label
- Minimum 2 manager approvals
- Dry-run preview with cost estimate

---

## Token Accounting

### Per-Job Tracking
```typescript
AILog {
  modelName: "claude-sonnet-4.5"
  promptLength: 2450
  tokensUsed: 3200
  costEstimate: 0.0096  // $0.003/1K tokens
  latencyMs: 1850
}
```

### Per-User Quotas
```typescript
User {
  dailyTokenBudget: 100000
  tokensUsedToday: 42300
  monthlyTokenBudget: 1000000
  tokensUsedMonth: 256000
}
```

**Enforcement:**
- Check before job creation
- Reject if over budget
- Admin alert at 80% usage

---

## Security

### Authentication
- Worker endpoints: `AI_WORKER_SERVICE_TOKEN` required
- Manager routes: `role = MANAGER or ADMIN` required
- Seller routes: Authenticated user required

### Secrets Management
- All keys server-side only
- Never expose to client
- Webhook signature verification

### Rate Limiting
```typescript
maxJobsPerHour: 50
maxConcurrentJobs: 10
maxConcurrentAICalls: 20
```

---

## Next Steps (Implementation Roadmap)

### Week 1-2: Core Worker
- [ ] Create prompt templates (`src/lib/prompts/`)
- [ ] Implement deterministic baseline computation
- [ ] Build AI worker core with job claiming
- [ ] Add retry logic with exponential backoff

### Week 3-4: API & Linear
- [ ] Create API routes (Express or Next.js)
- [ ] Implement Linear webhook handler
- [ ] Add authentication middleware
- [ ] Build embedding generation function

### Week 5-6: Manager UI
- [ ] Create Manager Dashboard page
- [ ] Build AIJobs table with filters
- [ ] Add Job Detail Panel (3-column layout)
- [ ] Implement bulk operations wizard

### Week 7-8: Testing & Deploy
- [ ] Unit tests for all schemas
- [ ] Integration tests with mocked AI
- [ ] E2E tests for critical flows
- [ ] Production deployment guide

---

## Testing

### Test Linear Connection
```bash
node test-linear.js
```

### Run Prisma Studio
```bash
npx prisma studio
# Opens at http://localhost:5555
```

### Verify pgvector
```bash
psql $DATABASE_URL
\dx vector
# Should show vector extension
```

---

## Files Created

### Database & Schema
- `prisma/schema.prisma` (296 lines) ✅

### Constants & Types
- `src/constants/categories.ts` (98 lines) ✅

### Validation
- `src/lib/schemas.ts` (231 lines) ✅

### Linear Integration
- `src/lib/linear/issue-template.ts` (204 lines) ✅
- `src/lib/linear/smoke-test.ts` (180 lines) ✅

### Documentation
- `docs/SETUP.md` (350 lines) ✅
- `docs/ARCHITECTURE.md` (450 lines) ✅
- `docs/IMPLEMENTATION_STATUS.md` (detailed roadmap) ✅
- `docs/AI_SYSTEM_README.md` (this file) ✅

### Configuration
- `.env.example` (80 lines) ✅

### Testing
- `test-linear.js` (60 lines) ✅

**Total:** ~2,000 lines of production-ready code and documentation

---

## Support

**Documentation:**
- [SETUP.md](./SETUP.md) - Installation guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - Roadmap

**Linear Workspace:**
- Organization: 444
- Team: 444 (444)
- API Key: Configured ✅

---

## License

MIT

---

🚀 **Foundation complete. Ready to build the AIJob pipeline!**
