/**
 * POST /api/aijobs/[id]/apply
 * Apply an AI job's suggestion to the item
 *
 * User applies their own AI suggestions
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '@/src/lib/auth';

const prisma = new PrismaClient();

const ApplySchema = z.object({
  reason: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Require authentication
    const currentUser = await requireAuth(request);


    // Get the job
    const job = await prisma.aIJob.findUnique({
      where: { id },
      include: { item: true },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Ensure user owns this job
    if (job.userId !== currentUser.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    if (job.status !== 'SUCCEEDED' && job.status !== 'NEEDS_REVIEW') {
      return NextResponse.json(
        { error: 'Job must be in SUCCEEDED or NEEDS_REVIEW status' },
        { status: 400 }
      );
    }

    if (!job.result) {
      return NextResponse.json(
        { error: 'Job has no result to apply' },
        { status: 400 }
      );
    }

    // Apply result to item (transaction)
    const result = await prisma.$transaction(async (tx) => {
      // Update item based on job type
      const updates: any = {};

      switch (job.jobType) {
        case 'PRICE_SUGGESTION':
          updates.suggestedPrice = job.result;
          break;

        case 'CONDITION_GRADE':
          updates.conditionSuggestion = job.result;
          break;

        case 'NORMALIZE':
          const normalized = job.result as any;
          if (normalized.brand_normalized) updates.brand = normalized.brand_normalized;
          if (normalized.color_hex_or_name) updates.color = normalized.color_hex_or_name;
          if (normalized.tags) updates.normalizedTags = normalized.tags;
          if (normalized.category) updates.category = normalized.category;
          if (normalized.subcategory) updates.subcategory = normalized.subcategory;
          if (normalized.material) updates.material = normalized.material;
          if (normalized.style) updates.style = normalized.style;
          break;
      }

      // Update item
      if (job.itemId) {
        await tx.item.update({
          where: { id: job.itemId },
          data: {
            ...updates,
            lastAiRunAt: new Date(),
          },
        });
      }

      // Mark job as applied
      await tx.aIJob.update({
        where: { id: job.id },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
          reviewedAt: new Date(),
        },
      });

      return { updates };
    });

    return NextResponse.json({
      message: 'Job applied successfully',
      jobId: job.id,
      itemId: job.itemId,
      applied: result.updates,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error applying job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
