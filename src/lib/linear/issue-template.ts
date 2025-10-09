/**
 * Linear issue templates for AI Review (MCP workflow)
 */

import type { DeterministicBaseline, PriceSuggestion } from '../schemas';

export interface LinearIssueTemplateData {
  jobId: string;
  jobType: string;
  itemId: string;
  itemTitle: string;
  deterministicBaseline?: DeterministicBaseline | null;
  result: any;
  rawOutput?: string;
  tokensUsed: number;
  costEstimate: number;
  promptVersion: string;
  confidence?: number;
  reason: string;
  managerJobUrl: string;
}

/**
 * Create Linear issue title for AI review
 */
export function createIssueTitle(data: LinearIssueTemplateData): string {
  return `[AI Review] ${data.jobType} — ${data.itemTitle} — ${data.reason}`;
}

/**
 * Create Linear issue body with all context for manager review
 */
export function createIssueBody(data: LinearIssueTemplateData): string {
  const sections: string[] = [];

  // Header
  sections.push(`## AI Job Review Required`);
  sections.push('');
  sections.push(`**Job ID:** ${data.jobId}`);
  sections.push(`**Job Type:** ${data.jobType}`);
  sections.push(`**Item:** [${data.itemTitle}](${data.managerJobUrl})`);
  sections.push(`**Reason:** ${data.reason}`);
  sections.push('');

  // Model details
  sections.push(`### Model Details`);
  sections.push(`- **Prompt Version:** ${data.promptVersion}`);
  sections.push(`- **Tokens Used:** ${data.tokensUsed.toLocaleString()}`);
  sections.push(`- **Est. Cost:** $${data.costEstimate.toFixed(4)}`);
  if (data.confidence !== undefined) {
    sections.push(`- **Confidence:** ${(data.confidence * 100).toFixed(1)}%`);
  }
  sections.push('');

  // Deterministic baseline (for price suggestions)
  if (data.deterministicBaseline) {
    sections.push(`### Deterministic Baseline (Pre-AI)`);
    sections.push('');
    sections.push('| Metric | Value |');
    sections.push('|--------|-------|');
    sections.push(`| Median | $${(data.deterministicBaseline.median / 100).toFixed(2)} |`);
    sections.push(`| Mean | $${(data.deterministicBaseline.mean / 100).toFixed(2)} |`);
    sections.push(`| Std Dev | $${(data.deterministicBaseline.std / 100).toFixed(2)} |`);
    sections.push(`| Sample Size | ${data.deterministicBaseline.count} |`);
    sections.push(`| Min | $${(data.deterministicBaseline.min / 100).toFixed(2)} |`);
    sections.push(`| Max | $${(data.deterministicBaseline.max / 100).toFixed(2)} |`);
    sections.push('');

    // Top 5 comps
    if (data.deterministicBaseline.top5_comps.length > 0) {
      sections.push(`### Top 5 Comparable Sales`);
      sections.push('');
      sections.push('| Price | Sold Date | Brand | Category | Distance |');
      sections.push('|-------|-----------|-------|----------|----------|');

      data.deterministicBaseline.top5_comps.forEach(comp => {
        const price = `$${(comp.price_cents / 100).toFixed(2)}`;
        const date = new Date(comp.sold_at).toLocaleDateString();
        const brand = comp.brand || 'N/A';
        const category = comp.category || 'N/A';
        const distance = comp.distance !== undefined ? comp.distance.toFixed(4) : 'N/A';
        sections.push(`| ${price} | ${date} | ${brand} | ${category} | ${distance} |`);
      });
      sections.push('');
    }
  }

  // AI Suggestion
  sections.push(`### AI Suggestion`);
  sections.push('');
  sections.push('```json');
  sections.push(JSON.stringify(data.result, null, 2));
  sections.push('```');
  sections.push('');

  // Delta analysis (for price suggestions)
  if (data.jobType === 'PRICE_SUGGESTION' && data.deterministicBaseline) {
    const aiSuggestion = data.result as PriceSuggestion;
    const baselineMedian = data.deterministicBaseline.median;
    const aiMedian = aiSuggestion.suggestedMedianCents;
    const delta = aiMedian - baselineMedian;
    const deltaPercent = ((delta / baselineMedian) * 100).toFixed(1);

    sections.push(`### Delta Analysis`);
    sections.push('');
    sections.push(`- **Baseline Median:** $${(baselineMedian / 100).toFixed(2)}`);
    sections.push(`- **AI Suggested Median:** $${(aiMedian / 100).toFixed(2)}`);
    sections.push(`- **Delta:** $${(delta / 100).toFixed(2)} (${deltaPercent}%)`);
    sections.push('');

    if (Math.abs(parseFloat(deltaPercent)) > 20) {
      sections.push(`⚠️ **Warning:** AI suggestion differs from baseline by >20%`);
      sections.push('');
    }
  }

  // Raw output (if validation failed)
  if (data.rawOutput) {
    sections.push(`### Raw Model Output`);
    sections.push('');
    sections.push('<details>');
    sections.push('<summary>View raw output</summary>');
    sections.push('');
    sections.push('```');
    sections.push(data.rawOutput);
    sections.push('```');
    sections.push('');
    sections.push('</details>');
    sections.push('');
  }

  // Action items
  sections.push(`### Suggested Actions`);
  sections.push('');
  sections.push('- [ ] Review deterministic baseline and AI suggestion');
  sections.push('- [ ] Check reasoning and confidence scores');
  sections.push('- [ ] Verify against marketplace comps manually (if needed)');
  sections.push('- [ ] **Approve** and apply suggestion, OR');
  sections.push('- [ ] **Edit** suggestion inline in Manager UI, OR');
  sections.push('- [ ] **Reject** and mark for manual review');
  sections.push('');

  // Link to manager workspace
  sections.push(`### Quick Links`);
  sections.push('');
  sections.push(`- [View in Manager Workspace](${data.managerJobUrl})`);
  sections.push(`- [View Item Details](${data.managerJobUrl.replace('/jobs/', '/items/')})`);
  sections.push('');

  // Footer
  sections.push('---');
  sections.push('');
  sections.push('🤖 Generated automatically by AI Job pipeline');

  return sections.join('\n');
}

/**
 * Create Linear issue labels for AI review
 */
export function createIssueLabels(data: LinearIssueTemplateData): string[] {
  const labels = ['ai-review', data.jobType.toLowerCase()];

  if (data.confidence !== undefined) {
    if (data.confidence < 0.6) {
      labels.push('low-confidence');
    } else if (data.confidence < 0.8) {
      labels.push('medium-confidence');
    } else {
      labels.push('high-confidence');
    }
  }

  // Add priority based on cost
  if (data.costEstimate > 0.5) {
    labels.push('high-cost');
  }

  // Add labels based on job type
  if (data.jobType === 'BULK_NORMALIZE' || data.jobType === 'BULK_PRICE') {
    labels.push('bulk-operation');
  }

  return labels;
}

/**
 * Determine Linear issue priority (0-4, where 0 is no priority and 4 is urgent)
 */
export function getIssuePriority(data: LinearIssueTemplateData): number {
  // Low confidence = higher priority for review
  if (data.confidence !== undefined && data.confidence < 0.5) {
    return 3; // High priority
  }

  // Bulk operations need careful review
  if (data.jobType.startsWith('BULK_')) {
    return 3;
  }

  // High cost jobs
  if (data.costEstimate > 0.5) {
    return 2; // Medium priority
  }

  return 1; // Normal priority
}
