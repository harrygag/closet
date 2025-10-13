/**
 * POST /api/aijobs/[id]/apply
 * Apply an AI job's suggestion to the item
 *
 * Manager-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const ApplySchema = z.object({
  actorId: z.string(), // Manager who is applying
  reason: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const validated = ApplySchema.parse(body);

    // Get the job
    const job = await prisma.aIJob.findUnique({
      where: { id: params.id },
      include: { item: true },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'SUCCEEDED' && job.status !== 'MANAGER_APPROVED') {
      return NextResponse.json(
        { error: 'Job must be in SUCCEEDED or MANAGER_APPROVED status' },
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
          managerApproved: true,
          appliedAt: new Date(),
          appliedByUserId: validated.actorId,
        },
      });

      // Create audit record
      await tx.managerAudit.create({
        data: {
          aijobId: job.id,
          actorId: validated.actorId,
          actionType: 'APPLY_TO_ITEM',
          actionPayload: {
            jobType: job.jobType,
            reason: validated.reason || 'Applied via API',
            updates,
          },
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
