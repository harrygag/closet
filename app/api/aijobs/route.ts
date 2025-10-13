/**
 * POST /api/aijobs - Create a new AI job
 * GET /api/aijobs - List AI jobs with filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Input validation schema
const CreateAIJobSchema = z.object({
  userId: z.string(),
  itemId: z.string().optional(),
  jobType: z.enum(['NORMALIZE', 'PRICE_SUGGESTION', 'CONDITION_GRADE', 'GENERATE_LISTINGS', 'GENERATE_EMBEDDING', 'BULK_NORMALIZE', 'BULK_PRICE']),
  inputPayload: z.record(z.any()),
  promptVersion: z.string().optional(),
});

/**
 * POST /api/aijobs
 * Create a new AI job
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validated = CreateAIJobSchema.parse(body);

    // Check user token quota
    const user = await prisma.user.findUnique({
      where: { id: validated.userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check daily token budget
    const dailyBudget = user.dailyTokenBudget;
    const tokensUsedToday = user.tokensUsedToday;

    if (tokensUsedToday >= dailyBudget) {
      return NextResponse.json(
        { error: 'Daily token budget exceeded', tokensUsedToday, dailyBudget },
        { status: 429 }
      );
    }

    // Compute input hash for idempotency
    const promptVersion = validated.promptVersion || 'v1';
    const hashInput = JSON.stringify({
      inputPayload: validated.inputPayload,
      jobType: validated.jobType,
      promptVersion,
    });
    const inputHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    // Check if job with same inputHash already exists
    const existingJob = await prisma.aIJob.findFirst({
      where: {
        inputHash,
        status: 'SUCCEEDED',
      },
    });

    if (existingJob) {
      return NextResponse.json({
        jobId: existingJob.id,
        status: existingJob.status,
        result: existingJob.result,
        message: 'Idempotent: reusing existing result',
      });
    }

    // Create new job
    const job = await prisma.aIJob.create({
      data: {
        userId: validated.userId,
        itemId: validated.itemId,
        jobType: validated.jobType,
        inputPayload: validated.inputPayload,
        inputHash,
        promptVersion,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        availableAt: new Date(),
      },
    });

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      inputHash: job.inputHash,
      message: 'Job created successfully',
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating AI job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/aijobs
 * List AI jobs with filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get('userId');
    const itemId = searchParams.get('itemId');
    const status = searchParams.get('status');
    const jobType = searchParams.get('jobType');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};

    if (userId) where.userId = userId;
    if (itemId) where.itemId = itemId;
    if (status) where.status = status;
    if (jobType) where.jobType = jobType;

    const [jobs, total] = await Promise.all([
      prisma.aIJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
          item: {
            select: { id: true, title: true, brand: true, category: true },
          },
        },
      }),
      prisma.aIJob.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      total,
      limit,
      offset,
      hasMore: total > offset + limit,
    });

  } catch (error) {
    console.error('Error listing AI jobs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
