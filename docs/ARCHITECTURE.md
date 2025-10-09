# Architecture Overview

## System Design

The Closet Reseller App is a full-stack application designed around an **auditable AIJob pipeline** with human-in-the-loop review via Linear MCP integration.

---

## Core Components

### 1. Frontend (Existing Vite + React)

- **Closet View**: Card-based grid with Pokémon-themed energy bars
- **Item Management**: Add, edit, manage clothing items
- **Stats Dashboard**: Analytics and metrics
- **Manager Workspace** (to be built): AIJob review interface

### 2. Database (PostgreSQL + Prisma)

**Tables:**
- `User` - Sellers, managers, admins with token budgets
- `Item` - Clothing items with AI-generated suggestions
- `AIJob` - Idempotent AI task pipeline with versioning
- `Prompt` - Versioned prompt templates
- `AILog` - Token accounting and cost tracking
- `ManagerAudit` - Immutable action history
- `LinearSync` - Linear issue tracking
- `Tag`, `ItemTag` - Normalized tagging

**Key Features:**
- pgvector for embeddings (1536-dimensional)
- JSON fields for flexible AI outputs
- Comprehensive indexing for performance
- Audit trail for compliance

### 3. AIJob Pipeline

```
┌─────────────┐
│ Create Job  │  Validate input, compute input_hash
└──────┬──────┘
       │
       ↓
┌─────────────┐
│   Enqueue   │  Check quotas, set status=PENDING
└──────┬──────┘
       │
       ↓
┌─────────────┐
│    Claim    │  SELECT FOR UPDATE (idempotency check)
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Compute    │  Deterministic baseline (comps + stats)
│  Baseline   │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│   Call AI   │  Claude/OpenAI with strict JSON schema
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Validate   │  Zod schema + confidence checks
└──────┬──────┘
       │
       ├─ Success ──→ status=SUCCEEDED
       ├─ Low confidence ──→ status=NEEDS_REVIEW + Create Linear issue
       └─ Failure ──→ Retry with backoff or status=FAILED
```

---

## AIJob Types

| Job Type | Purpose | Output Schema | MCP Required |
|----------|---------|---------------|--------------|
| `NORMALIZE` | Standardize attributes (brand, color, tags) | NormalizeSchema | No |
| `PRICE_SUGGESTION` | Suggest price range with comps | PriceSuggestionSchema | If low confidence |
| `CONDITION_GRADE` | Grade condition and detect defects | ConditionSchema | If defects found |
| `GENERATE_LISTINGS` | Create platform-optimized titles/descriptions | GenerateListingsSchema | No |
| `GENERATE_EMBEDDING` | Create 1536-d vector for search | EmbeddingSchema | No |
| `BULK_NORMALIZE` | Batch normalization | Array of NormalizeSchema | Yes |
| `BULK_PRICE` | Batch pricing | Array of PriceSuggestionSchema | Yes |

---

## Deterministic Baseline

**Computed before AI call:**
1. Query top-K comps via embedding similarity or category/brand match
2. Compute stats: `median`, `mean`, `std`, `count`, `min`, `max`
3. Extract top-5 closest comps with distance
4. Persist in `AIJob.deterministicBaseline`
5. Include in AI prompt as ground truth

**Why?**
- Anchors AI reasoning to factual data
- Enables delta analysis (AI vs. baseline)
- Provides fallback if AI fails
- Auditability for manager review

---

## Linear MCP Integration

### When Linear Issues Are Created

1. **Automatic triggers:**
   - AIJob status → `NEEDS_REVIEW`
   - Confidence < threshold (configurable per job type)
   - Prompt metadata `mcpRequired = true`
   - Any `BULK_*` job type

2. **Manual triggers:**
   - Manager clicks "Create Linear Issue" in UI
   - Retry job after failure

### Issue Contents

- Job ID, item link, job type
- Deterministic baseline (for price suggestions)
- Top-5 comps table
- AI suggestion (JSON)
- Delta analysis (baseline vs. AI)
- Raw model output (if validation failed)
- Tokens used, cost estimate
- Quick action checklist

### Webhook Flow

```
Linear Issue Created
       ↓
Linear Webhook → /api/webhooks/linear
       ↓
Update AIJob.linearIssueId
Update LinearSync table
       ↓
Issue marked "Done" in Linear
       ↓
Webhook → Set AIJob.managerApproved = true
       ↓
Manager clicks "Apply" in UI
       ↓
POST /api/aijobs/:id/apply
       ↓
Transaction: Update Item + ManagerAudit
```

---

## Idempotency & Retries

### Idempotency

```typescript
inputHash = SHA256(
  JSON.stringify(inputPayload) +
  promptVersion +
  jobType
)
```

**Before processing job:**
1. Check if `AIJob` with same `inputHash` and `status=SUCCEEDED` exists
2. If yes, copy `result` and skip AI call (idempotent replay)
3. If no, proceed with AI call

### Retry Strategy

```typescript
if (transientError && attempts < maxAttempts) {
  attempts++
  availableAt = now() + exponentialBackoff(attempts) + jitter()
  status = PENDING
} else {
  status = FAILED
  create Linear issue
}
```

**Exponential backoff:**
- Attempt 1: 30s + jitter
- Attempt 2: 60s + jitter
- Attempt 3: 120s + jitter

---

## Token Accounting & Cost Control

### Per-Job Tracking

```typescript
AILog {
  modelName: "claude-sonnet-4.5"
  promptLength: 2450
  tokensUsed: 3200
  costEstimate: 0.0096 // $0.003/1K input
  latencyMs: 1850
}
```

### Per-User Quotas

```typescript
User {
  dailyTokenBudget: 100000
  monthlyTokenBudget: 1000000
  tokensUsedToday: 42300
  tokensUsedMonth: 256000
}
```

**Enforcement:**
- Check quota before creating job
- Reject if `tokensUsedToday + estimatedTokens > dailyTokenBudget`
- Admin alert if user exceeds 80% of quota

### Admin Controls

- Global kill switch (env: `ENABLE_AUTO_PUBLISH=false`)
- Per-job-type feature flags
- Dry-run mode for bulk operations
- Real-time cost dashboard

---

## Pokémon → Clothing Category Mapping

| Category | Pokémon Type | Hex Color | Border | Glow |
|----------|--------------|-----------|--------|------|
| Polos | White | #F5F5F5 | #E0E0E0 | rgba(245, 245, 245, 0.5) |
| Hoodies | Pink | #FF69B4 | #FF1493 | rgba(255, 105, 180, 0.5) |
| Shirts | Blue | #00BFFF | #1E90FF | rgba(0, 191, 255, 0.5) |
| Pullovers/Jackets | Red | #FF6347 | #FF4500 | rgba(255, 99, 71, 0.5) |
| Bottoms | Orange | #FFA500 | #FF8C00 | rgba(255, 165, 0, 0.5) |
| Jerseys | Green | #00FF00 | #32CD32 | rgba(0, 255, 0, 0.5) |

**Usage:**
- ItemCard borders use category color
- Energy bars (HP/days remaining) use category glow
- Category badges in UI
- Filter/sort by category uses these constants

---

## Prompt Versioning

### Prompt Table

```typescript
Prompt {
  id: "clp5x..."
  version: "price_v1" // unique identifier
  template: "You are a pricing expert..." // actual prompt
  jobType: PRICE_SUGGESTION
  mcpRequired: false
  impactLevel: MEDIUM
  modelName: "claude-sonnet-4.5"
  temperature: 0.2
  maxTokens: 2000
}
```

### Version Control

1. **Create new version** (never edit existing):
   ```sql
   INSERT INTO Prompt (version, template, ...)
   VALUES ('price_v2', '...', ...);
   ```

2. **Canary rollout:**
   - 5% of jobs use `price_v2`
   - Monitor metrics for 48-72 hours
   - Compare success rate, confidence, needs_review rate

3. **Promote or rollback:**
   - If stable: Update default to `price_v2`
   - If issues: Revert to `price_v1`

### Prompt Change Workflow

```
Developer proposes prompt change
       ↓
Create Linear ticket with:
  - Prompt diff
  - Sample inputs/outputs
  - CI contract test results
       ↓
Manager reviews in Linear
       ↓
Approved → Merge to repo → Deploy canary
       ↓
Monitor metrics
       ↓
Promote to 100% or rollback
```

---

## Security

### API Authentication

```typescript
// Worker endpoints
POST /api/aijobs/process
Headers: { Authorization: "Bearer AI_WORKER_SERVICE_TOKEN" }

// Manager endpoints
POST /api/aijobs/:id/apply
Requires: user.role === MANAGER or ADMIN

// Seller endpoints
POST /api/items
Requires: authenticated user
```

### Data Protection

- Passwords: Never stored (use NextAuth or similar)
- API keys: Server-side only, never exposed to client
- Linear webhooks: Verify signature with `LINEAR_WEBHOOK_SECRET`
- S3 uploads: Presigned URLs with 15-minute expiry
- Database: Parameterized queries (Prisma)

### Rate Limiting

```typescript
// Per-user limits
maxJobsPerHour: 50
maxConcurrentJobs: 10

// Global limits
maxConcurrentAICalls: 20
maxTokensPerMinute: 100000
```

---

## Observability

### Metrics to Track

1. **Job Metrics:**
   - Jobs created/sec
   - Jobs succeeded/failed/needs_review %
   - Average job latency
   - Queue depth

2. **Cost Metrics:**
   - Tokens/hour
   - Cost/hour ($USD)
   - Cost per job type
   - Top users by cost

3. **Quality Metrics:**
   - Confidence score distribution
   - Needs_review rate by job type
   - Schema validation failure rate
   - Linear issue resolution time

4. **System Metrics:**
   - Database connection pool usage
   - API response times
   - pgvector query latency
   - S3 upload success rate

### Alerts

```typescript
alerts: [
  { metric: "needs_review_rate", threshold: "> 15%", window: "1h" },
  { metric: "tokens_per_hour", threshold: "> 50000", window: "5m" },
  { metric: "job_failure_rate", threshold: "> 5%", window: "15m" },
  { metric: "schema_validation_failures", threshold: "> 10", window: "1h" },
  { metric: "linear_webhook_errors", threshold: "> 3", window: "5m" },
]
```

---

## Future Enhancements

1. **Real-time Updates**: WebSocket for live job status
2. **Batch Embeddings**: Batch OpenAI API calls for efficiency
3. **Multi-region**: Deploy workers in multiple regions
4. **Advanced Analytics**: ML model drift detection
5. **Marketplace Auto-Publish**: Direct API integration with eBay/Poshmark
6. **Mobile App**: React Native with offline support
7. **A/B Testing**: Compare prompt versions with statistical rigor

---

## Technology Stack Summary

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS
- Radix UI components
- Zustand (state management)
- Chart.js (analytics)

**Backend:**
- Node.js 20
- Prisma ORM
- PostgreSQL 15+ with pgvector
- Zod (validation)
- Linear GraphQL API

**AI:**
- Claude Sonnet 4.5 (generation)
- OpenAI embeddings (text-embedding-3-small)
- Temperature 0-0.3 for structured tasks

**Infrastructure:**
- Vercel / Cloud Run (hosting)
- AWS S3 (image storage)
- Supabase / Neon / RDS (database)
- GitHub Actions (CI/CD)

**Observability:**
- Sentry (errors)
- Datadog / Logflare (logs & metrics)
- Prisma Studio (database inspection)

---

✅ **Architecture is production-ready, scalable, and auditable.**
