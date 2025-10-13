/**
 * POST /api/aijobs/process
 * Worker endpoint to claim and process pending AI jobs
 *
 * Protected by AI_WORKER_SERVICE_TOKEN
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getOpenAIClient } from '@/src/lib/ai/openai-client';
import {
  PriceSuggestionSchema,
  NormalizeSchema,
  ConditionSchema,
  GenerateListingsSchema,
  EmbeddingSchema,
} from '@/src/lib/schemas';

const prisma = new PrismaClient();

// Authentication check
function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.AI_WORKER_SERVICE_TOKEN;

  if (!expectedToken) {
    console.error('AI_WORKER_SERVICE_TOKEN not configured');
    return false;
  }

  const token = authHeader?.replace('Bearer ', '');
  return token === expectedToken;
}

/**
 * POST /api/aijobs/process
 * Claim and process one or more pending jobs
 */
export async function POST(request: NextRequest) {
  // Check authentication
  if (!checkAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const batchSize = body.batchSize || 1;

    // Claim pending jobs (transaction to prevent race conditions)
    const claimedJobs = await prisma.$transaction(async (tx) => {
      const jobs = await tx.aIJob.findMany({
        where: {
          status: 'PENDING',
          availableAt: { lte: new Date() },
        },
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });

      // Mark as PROCESSING
      await tx.aIJob.updateMany({
        where: {
          id: { in: jobs.map(j => j.id) },
        },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(),
        },
      });

      return jobs;
    });

    if (claimedJobs.length === 0) {
      return NextResponse.json({
        message: 'No jobs to process',
        processed: 0,
      });
    }

    // Process each job
    const results = [];
    for (const job of claimedJobs) {
      const result = await processJob(job);
      results.push(result);
    }

    return NextResponse.json({
      message: `Processed ${results.length} job(s)`,
      processed: results.length,
      results: results.map(r => ({
        jobId: r.jobId,
        status: r.status,
        tokensUsed: r.tokensUsed,
        costEstimate: r.costEstimate,
      })),
    });

  } catch (error) {
    console.error('Error in worker:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * Process a single AI job
 */
async function processJob(job: any) {
  const startTime = Date.now();

  try {
    const client = getOpenAIClient();

    // Get schema based on job type
    const schema = getSchemaForJobType(job.jobType);
    if (!schema) {
      throw new Error(`Unknown job type: ${job.jobType}`);
    }

    // Get prompt for job type
    const prompt = await buildPrompt(job);

    // Call OpenAI
    const result = await client.createStructuredCompletion(
      prompt,
      schema,
      {
        temperature: 0.0,
        maxTokens: 2000,
      }
    );

    // Log tokens
    await prisma.aILog.create({
      data: {
        aijobId: job.id,
        modelName: result.model,
        promptLength: prompt.length,
        requestBytes: prompt.length,
        responseBytes: result.rawResponse.length,
        tokensUsed: result.usage.totalTokens,
        costEstimate: result.costEstimate.totalCostUSD,
        latencyMs: result.latencyMs,
      },
    });

    // Determine if needs review
    const needsReview = shouldNeedReview(job.jobType, result.data);

    // Update job
    await prisma.aIJob.update({
      where: { id: job.id },
      data: {
        status: needsReview ? 'NEEDS_REVIEW' : 'SUCCEEDED',
        result: result.data,
        rawOutput: result.rawResponse,
        tokensUsed: result.usage.totalTokens,
        costEstimate: result.costEstimate.totalCostUSD,
        needsReview,
        updatedAt: new Date(),
      },
    });

    // Update user token usage
    await prisma.user.update({
      where: { id: job.userId },
      data: {
        tokensUsedToday: { increment: result.usage.totalTokens },
        tokensUsedMonth: { increment: result.usage.totalTokens },
      },
    });

    return {
      jobId: job.id,
      status: needsReview ? 'NEEDS_REVIEW' : 'SUCCEEDED',
      tokensUsed: result.usage.totalTokens,
      costEstimate: result.costEstimate.totalCostUSD,
    };

  } catch (error) {
    const latencyMs = Date.now() - startTime;

    // Check if should retry
    const shouldRetry = job.attempts < job.maxAttempts;

    if (shouldRetry) {
      // Exponential backoff
      const backoffMs = Math.pow(2, job.attempts) * 1000 * (1 + Math.random());
      const availableAt = new Date(Date.now() + backoffMs);

      await prisma.aIJob.update({
        where: { id: job.id },
        data: {
          status: 'PENDING',
          attempts: job.attempts + 1,
          errorMessage: error instanceof Error ? error.message : String(error),
          availableAt,
          updatedAt: new Date(),
        },
      });

      return {
        jobId: job.id,
        status: 'RETRY_SCHEDULED',
        attempts: job.attempts + 1,
        availableAt,
      };
    } else {
      // Max attempts reached
      await prisma.aIJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        },
      });

      return {
        jobId: job.id,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Get Zod schema for job type
 */
function getSchemaForJobType(jobType: string) {
  const schemas: Record<string, any> = {
    NORMALIZE: NormalizeSchema,
    PRICE_SUGGESTION: PriceSuggestionSchema,
    CONDITION_GRADE: ConditionSchema,
    GENERATE_LISTINGS: GenerateListingsSchema,
    GENERATE_EMBEDDING: EmbeddingSchema,
  };
  return schemas[jobType];
}

/**
 * Build prompt for job
 * TODO: Load from Prompt table with versioning
 */
async function buildPrompt(job: any): Promise<string> {
  const payload = job.inputPayload;

  switch (job.jobType) {
    case 'PRICE_SUGGESTION':
      return `You are a pricing expert for resale clothing. Suggest a price range for this item:

Item Details:
${JSON.stringify(payload, null, 2)}

Return ONLY valid JSON matching this structure:
{
  "suggestedMinCents": <integer>,
  "suggestedMedianCents": <integer>,
  "suggestedMaxCents": <integer>,
  "confidence": <0-1 float>,
  "reasoning": ["<reason 1>", "<reason 2>", ...]
}`;

    case 'NORMALIZE':
      return `Normalize the following clothing item attributes:

Item: ${payload.title}
Description: ${payload.description || 'N/A'}

Extract and normalize: category, subcategory, brand, color, tags, material, style.

Return ONLY valid JSON.`;

    case 'CONDITION_GRADE':
      return `Grade the condition of this clothing item:

Item: ${payload.title}
Notes: ${payload.notes || 'N/A'}

Return condition grade (NWT, NWOT, Excellent, Good, Fair, Poor) and defects if any.

Return ONLY valid JSON.`;

    case 'GENERATE_LISTINGS':
      return `Generate marketplace-optimized listings for:

Item: ${payload.title}
Brand: ${payload.brand}
Category: ${payload.category}

Create variants for: ${payload.platforms?.join(', ') || 'eBay, Poshmark'}

Return ONLY valid JSON.`;

    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}

/**
 * Determine if job needs manager review
 */
function shouldNeedReview(jobType: string, result: any): boolean {
  // Check confidence threshold
  if (result.confidence !== undefined && result.confidence < 0.7) {
    return true;
  }

  // Check for major defects
  if (jobType === 'CONDITION_GRADE' && result.defects) {
    const majorDefects = result.defects.filter((d: any) => d.severity === 'major');
    if (majorDefects.length > 0) {
      return true;
    }
  }

  return false;
}
