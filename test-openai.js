/**
 * Quick OpenAI integration test
 */

import { getOpenAIClient } from './src/lib/ai/openai-client.ts';
import { PriceSuggestionSchema } from './src/lib/schemas.ts';

async function testOpenAI() {
  console.log('Testing OpenAI integration...\n');

  const client = getOpenAIClient();

  // Test 1: Simple completion
  console.log('📝 Test 1: Creative completion (title generation)');
  try {
    const result = await client.createCompletion(
      'Generate a catchy eBay title for a Nike Dri-FIT Golf Polo, size XL, excellent condition, red color. Keep it under 80 characters.',
      {
        temperature: 0.3,
        maxTokens: 50,
      }
    );

    console.log('✅ Success!');
    console.log('  Generated:', result.data);
    console.log('  Tokens:', result.usage.totalTokens);
    console.log('  Cost: $' + result.costEstimate.totalCostUSD.toFixed(6));
    console.log('  Latency:', result.latencyMs + 'ms\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 2: Structured completion with schema validation
  console.log('💰 Test 2: Structured completion (price suggestion)');
  try {
    const prompt = `
You are a pricing expert for resale clothing. Suggest a price range for this item:

Item: Nike Dri-FIT Golf Polo
Brand: Nike
Category: Polo
Size: XL
Condition: Excellent
Color: Red

Deterministic Baseline (from comparable sales):
- Median: $32.00
- Mean: $34.50
- Std Dev: $8.20
- Sample size: 47 sold in last 60 days

Top 5 Comparable Sales:
1. $35.00 - Nike Golf Polo XL - Sold 5 days ago
2. $30.00 - Nike Dri-FIT Polo L - Sold 12 days ago
3. $38.00 - Nike Golf Polo XL Blue - Sold 18 days ago
4. $28.00 - Nike Polo XL - Sold 25 days ago
5. $33.00 - Nike Dri-FIT Polo XL - Sold 30 days ago

Return ONLY valid JSON matching this structure:
{
  "suggestedMinCents": <integer>,
  "suggestedMedianCents": <integer>,
  "suggestedMaxCents": <integer>,
  "confidence": <0-1 float>,
  "reasoning": ["<reason 1>", "<reason 2>", ...]
}
`;

    const result = await client.createStructuredCompletion(
      prompt,
      PriceSuggestionSchema,
      {
        temperature: 0.0,
        maxTokens: 500,
      }
    );

    console.log('✅ Success!');
    console.log('  Suggested Price Range:');
    console.log('    Min: $' + (result.data.suggestedMinCents / 100).toFixed(2));
    console.log('    Median: $' + (result.data.suggestedMedianCents / 100).toFixed(2));
    console.log('    Max: $' + (result.data.suggestedMaxCents / 100).toFixed(2));
    console.log('  Confidence:', (result.data.confidence * 100).toFixed(1) + '%');
    console.log('  Reasoning:', result.data.reasoning.join('; '));
    console.log('  Tokens:', result.usage.totalTokens);
    console.log('  Cost: $' + result.costEstimate.totalCostUSD.toFixed(6));
    console.log('  Latency:', result.latencyMs + 'ms\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 3: Embedding generation
  console.log('🔍 Test 3: Embedding generation');
  try {
    const text = 'Nike Dri-FIT Golf Polo XL Red Excellent Condition';
    const result = await client.createEmbedding(text);

    console.log('✅ Success!');
    console.log('  Text:', text);
    console.log('  Dimension:', result.dimension);
    console.log('  First 5 values:', result.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', '));
    console.log('  Tokens:', result.usage.totalTokens);
    console.log('  Cost: $' + result.costEstimate.totalCostUSD.toFixed(6));
    console.log('  Latency:', result.latencyMs + 'ms\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('✅ All tests completed!');
}

testOpenAI().catch(console.error);
