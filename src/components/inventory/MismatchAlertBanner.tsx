/**
 * MismatchAlertBanner
 * Compact banner that sits at the top of ClosetView when there are unresolved
 * cross-platform mismatches (sold-but-still-listed, quantity mismatches, etc.)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, XCircle, X, ArrowRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MismatchAlertSummary {
  criticalCount: number; // sold but still listed, oversold
  warningCount: number; // quantity mismatch
  criticalMessage: string; // e.g. "3 items sold on Depop but still listed on eBay"
  warningMessage: string; // e.g. "2 quantity mismatches"
}

interface MismatchAlertBannerProps {
  alerts: MismatchAlertSummary | null;
  onReview: () => void;
}

// ---------------------------------------------------------------------------
// localStorage key for 24h dismiss
// ---------------------------------------------------------------------------

const DISMISS_KEY = 'mismatch_banner_dismissed_at';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = parseInt(raw, 10);
    if (isNaN(dismissedAt)) return false;
    return Date.now() - dismissedAt < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage not available
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MismatchAlertBanner: React.FC<MismatchAlertBannerProps> = ({
  alerts,
  onReview,
}) => {
  const [dismissed, setDismissedState] = useState(() => isDismissed());

  // Re-check dismiss state when alerts change
  useEffect(() => {
    setDismissedState(isDismissed());
  }, [alerts]);

  const handleDismiss = useCallback(() => {
    setDismissed();
    setDismissedState(true);
  }, []);

  // Don't render if dismissed, no alerts, or all counts are zero
  if (dismissed) return null;
  if (!alerts) return null;
  if (alerts.criticalCount === 0 && alerts.warningCount === 0) return null;

  const hasCritical = alerts.criticalCount > 0;
  const hasWarning = alerts.warningCount > 0;

  // Build the message parts
  const parts: string[] = [];
  if (hasCritical && alerts.criticalMessage) {
    parts.push(alerts.criticalMessage);
  }
  if (hasWarning && alerts.warningMessage) {
    parts.push(alerts.warningMessage);
  }
  const message = parts.join(' \u00b7 '); // middle dot separator

  // Use critical styling if any critical alerts, else warning styling
  const isCritical = hasCritical;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border mb-4 ${
        isCritical
          ? 'bg-red-500/10 border-red-500/20'
          : 'bg-yellow-500/10 border-yellow-500/20'
      }`}
    >
      {/* Icon */}
      {isCritical ? (
        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
      )}

      {/* Message */}
      <span
        className={`text-sm flex-1 truncate ${
          isCritical ? 'text-red-300' : 'text-yellow-300'
        }`}
      >
        {message}
      </span>

      {/* Review button */}
      <button
        type="button"
        onClick={onReview}
        className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
          isCritical
            ? 'bg-red-500/20 border-red-500/30 text-red-200 hover:bg-red-500/30'
            : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/30'
        }`}
      >
        Review
        <ArrowRight className="h-3 w-3" />
      </button>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] transition-colors"
        aria-label="Dismiss for 24 hours"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
