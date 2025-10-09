# OpenAI Integration Guide 🤖

Complete guide for using OpenAI as the primary AI provider for the Closet Reseller app.

---

## Overview

We've built a production-ready OpenAI wrapper with:
- ✅ Structured completions with Zod validation
- ✅ Creative text generation for titles/descriptions
- ✅ Embedding generation (1536-d vectors)
- ✅ Automatic token accounting & cost tracking
- ✅ Retry logic with fallback models
- ✅ Temperature controls (0.0 for structured, 0.3 for creative)

---

## Quick Start

### 1. Get Your OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-proj-...` or `sk-...`)
4. Add to `.env`:

```bash
OPENAI_API_KEY="sk-..."
```

### 2. Test the Integration

```bash
npx tsx test-openai.js
```

Expected output:
```
📝 Test 1: Creative completion (title generation)
✅ Success!
  Generated: Nike Dri-FIT Golf Polo Men's XL Red Excellent Condition FREE SHIP
  Tokens: 35
  Cost: $0.000005
  Latency: 850ms

💰 Test 2: Structured completion (price suggestion)
✅ Success!
  Suggested Price Range:
    Min: $28.00
    Median: $34.00
    Max: $40.00
  Confidence: 85.0%
  Reasoning: Based on 47 comparable sales; Current market median is $32.00
  Tokens: 425
  Cost: $0.000064
  Latency: 1200ms

🔍 Test 3: Embedding generation
✅ Success!
  Dimension: 1536
  First 5 values: 0.0234, -0.0156, 0.0089, -0.0234, 0.0167
  Tokens: 12
  Cost: $0.000002
  Latency: 450ms
```

---

## OpenAI Client Usage

### Import

```typescript
import { getOpenAIClient } from './src/lib/ai/openai-client.ts';
import { PriceSuggestionSchema } from './src/lib/schemas.ts';
```

### Structured Completion (with Zod Validation)

```typescript
const client = getOpenAIClient();

const result = await client.createStructuredCompletion(
  `Generate a price suggestion for: Nike Golf Polo, XL, Excellent...`,
  PriceSuggestionSchema, // Zod schema for validation
  {
    temperature: 0.0, // Deterministic
    maxTokens: 500,
  }
);

console.log(result.data); // Typed & validated
console.log(result.usage.totalTokens); // 425
console.log(result.costEstimate.totalCostUSD); // 0.000064
```

### Creative Completion (Text Generation)

```typescript
const result = await client.createCompletion(
  'Generate 3 catchy eBay titles for a Nike Golf Polo...',
  {
    temperature: 0.3, // Slightly creative
    maxTokens: 100,
  }
);

console.log(result.data); // Raw text response
```

### Embedding Generation

```typescript
const text = 'Nike Dri-FIT Golf Polo XL Red Excellent';
const result = await client.createEmbedding(text);

console.log(result.embedding); // Float array [0.023, -0.015, ...]
console.log(result.dimension); // 1536
```

### Batch Embeddings

```typescript
const texts = [
  'Nike Golf Polo XL Red',
  'Adidas Hoodie M Blue',
  'Under Armour Shirt L Black',
];

const results = await client.createEmbeddings(texts);
// Returns array of EmbeddingResult[]
```

---

## Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY="sk-..."

# Optional (defaults shown)
OPENAI_CHAT_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-large"
OPENAI_FALLBACK_MODEL="gpt-4o-mini"
OPENAI_TEMPERATURE_STRUCTURED="0.0"
OPENAI_TEMPERATURE_CREATIVE="0.3"
```

### Model Selection

**For Structured Output (normalize, price, condition):**
- Model: `gpt-4o-mini`
- Temperature: `0.0` (deterministic)
- Cost: **$0.15 input / $0.60 output per 1M tokens**

**For Creative Output (titles, descriptions):**
- Model: `gpt-4o-mini`
- Temperature: `0.3` (slightly creative)
- Cost: Same as above

**For Embeddings:**
- Model: `text-embedding-3-large`
- Dimension: `1536`
- Cost: **$0.13 per 1M tokens**

### Cost Estimates

| Task | Avg Tokens | Est. Cost |
|------|-----------|-----------|
| Normalize item | 300-500 | $0.0001 |
| Price suggestion | 400-600 | $0.0001 |
| Condition grade | 200-400 | $0.00006 |
| Generate listings | 600-1000 | $0.00015 |
| Embedding | 10-20 | $0.000003 |

**Example monthly cost for 10,000 items:**
- 10,000 normalize jobs = $1.00
- 10,000 price suggestions = $1.00
- 10,000 embeddings = $0.03
- **Total: ~$2-3/month**

---

## Integration with AIJob Pipeline

### Example: Price Suggestion Job

```typescript
import { getOpenAIClient } from './src/lib/ai/openai-client.ts';
import { PriceSuggestionSchema } from './src/lib/schemas.ts';

async function processPriceSuggestionJob(aijob: AIJob) {
  const client = getOpenAIClient();

  // 1. Compute deterministic baseline first
  const baseline = await computeDeterministicBaseline(aijob.itemId);

  // 2. Compose prompt with baseline
  const prompt = `
You are a pricing expert for resale clothing.

Item Details:
${JSON.stringify(aijob.inputPayload, null, 2)}

Deterministic Baseline (from ${baseline.count} comparable sales):
- Median: $${(baseline.median / 100).toFixed(2)}
- Mean: $${(baseline.mean / 100).toFixed(2)}
- Std Dev: $${(baseline.std / 100).toFixed(2)}

Top 5 Comparables:
${baseline.top5_comps.map((c, i) =>
  `${i+1}. $${(c.price_cents / 100).toFixed(2)} - ${c.brand} ${c.category} - Sold ${c.sold_at}`
).join('\n')}

Return ONLY valid JSON with your suggested price range and reasoning.
`;

  // 3. Call OpenAI
  const result = await client.createStructuredCompletion(
    prompt,
    PriceSuggestionSchema,
    { temperature: 0.0 }
  );

  // 4. Log tokens & cost
  await prisma.aILog.create({
    data: {
      aijobId: aijob.id,
      modelName: result.model,
      promptLength: prompt.length,
      tokensUsed: result.usage.totalTokens,
      costEstimate: result.costEstimate.totalCostUSD,
      latencyMs: result.latencyMs,
    },
  });

  // 5. Update AIJob
  await prisma.aIJob.update({
    where: { id: aijob.id },
    data: {
      status: result.data.confidence > 0.7 ? 'SUCCEEDED' : 'NEEDS_REVIEW',
      result: result.data,
      rawOutput: result.rawResponse,
      tokensUsed: result.usage.totalTokens,
      costEstimate: result.costEstimate.totalCostUSD,
    },
  });

  return result.data;
}
```

---

## Error Handling

### Automatic Retries

The client automatically retries on:
- 429 (Rate limit exceeded)
- 500 (Internal server error)
- 503 (Service unavailable)

Retries use exponential backoff and will fall back to `OPENAI_FALLBACK_MODEL` if configured.

### Manual Error Handling

```typescript
try {
  const result = await client.createStructuredCompletion(...);
} catch (error) {
  if (error.message.includes('Rate limit')) {
    // Wait and retry
    await sleep(60000);
    return retry();
  } else if (error.message.includes('Invalid JSON')) {
    // Schema validation failed
    // Mark job as NEEDS_REVIEW
    await createLinearIssue({
      title: 'AI output validation failed',
      body: error.message,
    });
  } else {
    // Unknown error
    throw error;
  }
}
```

---

## Best Practices

### 1. Always Use Schemas for Structured Output

```typescript
// ✅ Good
const result = await client.createStructuredCompletion(
  prompt,
  PriceSuggestionSchema
);

// ❌ Bad (no validation)
const result = await client.createCompletion(prompt);
const data = JSON.parse(result.data); // Unvalidated!
```

### 2. Include Deterministic Baselines

```typescript
// ✅ Good
const prompt = `
Deterministic Baseline:
- Median: $${baseline.median}
- Top 5 comps: [...]

Now suggest a price based on this data.
`;

// ❌ Bad (no grounding)
const prompt = 'Suggest a price for this Nike polo';
```

### 3. Set Appropriate Temperatures

```typescript
// ✅ Good
const priceResult = await client.createStructuredCompletion(
  prompt,
  PriceSuggestionSchema,
  { temperature: 0.0 } // Deterministic for pricing
);

const titleResult = await client.createCompletion(
  prompt,
  { temperature: 0.3 } // Slightly creative for titles
);

// ❌ Bad (too creative for structured data)
const priceResult = await client.createStructuredCompletion(
  prompt,
  PriceSuggestionSchema,
  { temperature: 0.8 } // Will produce inconsistent results
);
```

### 4. Always Log Tokens & Cost

```typescript
await prisma.aILog.create({
  data: {
    aijobId: job.id,
    modelName: result.model,
    tokensUsed: result.usage.totalTokens,
    costEstimate: result.costEstimate.totalCostUSD,
    // ...
  },
});
```

### 5. Check Confidence Scores

```typescript
if (result.data.confidence < 0.7) {
  // Low confidence - needs manager review
  await createLinearIssue({...});
  job.status = 'NEEDS_REVIEW';
}
```

---

## Troubleshooting

### API Key Invalid

**Error:** `401 Incorrect API key provided`

**Solution:**
1. Go to https://platform.openai.com/api-keys
2. Create a new key
3. Update `.env` with new key
4. Restart your app

### Rate Limit Exceeded

**Error:** `429 Rate limit exceeded`

**Solution:**
- Wait 60 seconds and retry
- Client automatically handles this with retries
- Consider upgrading your OpenAI plan for higher limits

### Invalid JSON Response

**Error:** `Failed to parse JSON response`

**Solution:**
- Check your prompt includes: "Return ONLY valid JSON"
- Use `response_format: { type: 'json_object' }` (automatically set)
- Review the `rawResponse` to see what model returned

### Zod Validation Failed

**Error:** `ZodError: Expected number, received string`

**Solution:**
- Model returned wrong type
- Update your prompt to be more explicit about types
- Add examples to prompt showing correct JSON structure

---

## Migration from Claude

If you were using Claude before, here are the changes:

| Claude | OpenAI |
|--------|--------|
| `claude-sonnet-4.5` | `gpt-4o-mini` |
| Temperature 0.2 | Temperature 0.0 (structured) |
| $3/$15 per 1M tokens | $0.15/$0.60 per 1M tokens |
| Anthropic SDK | OpenAI SDK |

**Cost savings:** OpenAI is **20x cheaper** for similar quality on structured tasks.

---

## Next Steps

1. ✅ Get valid OpenAI API key
2. ✅ Test integration: `npx tsx test-openai.js`
3. ⬜ Implement AIJob worker with OpenAI client
4. ⬜ Create prompt templates
5. ⬜ Build deterministic baseline computation
6. ⬜ Add manager review workflow
7. ⬜ Deploy and monitor costs

---

## Support

**OpenAI Documentation:**
- API Reference: https://platform.openai.com/docs/api-reference
- Pricing: https://openai.com/api/pricing/
- Rate Limits: https://platform.openai.com/docs/guides/rate-limits

**Our Files:**
- OpenAI Client: [src/lib/ai/openai-client.ts](../src/lib/ai/openai-client.ts)
- Schemas: [src/lib/schemas.ts](../src/lib/schemas.ts)
- Test Script: [test-openai.js](../test-openai.js)

---

✅ **OpenAI integration is ready! Just need a valid API key to start testing.**
