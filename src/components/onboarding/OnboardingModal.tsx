import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Puzzle,
  Home,
  ShoppingBag,
  Target,
  Coins,
  AlertOctagon,
  BookOpen,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

interface Step {
  icon: LucideIcon;
  /** Tailwind text color for the icon + accent line. */
  accent: string;
  /** Tailwind from-X to-Y for the step's hero gradient. */
  gradient: string;
  title: string;
  body: React.ReactNode;
  cta?: { label: string; href: string };
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    accent: 'text-cyan-300',
    gradient: 'from-cyan-500/20 to-blue-500/10',
    title: 'Welcome to RetroThriftCo Virtual Closet',
    body: (
      <>
        <p>
          This is your single source of truth for resale inventory across <b>eBay</b>,{' '}
          <b>Poshmark</b>, and <b>Depop</b>. The whole app is built around one rule:
          <i> never oversell a unit</i>.
        </p>
        <p className="mt-3 text-gray-400">
          The next ten steps walk through what each piece of the app does and the order
          you'll use them in. You can reopen this tour any time from the <b>?</b> button
          in the nav.
        </p>
      </>
    ),
  },
  {
    icon: Puzzle,
    accent: 'text-violet-300',
    gradient: 'from-violet-500/20 to-purple-500/10',
    title: 'Connect the Chrome extension',
    body: (
      <>
        <p>
          Poshmark and Depop don't expose proper APIs, so the app uses a Chrome extension
          to scrape and act inside your own logged-in browser session.
        </p>
        <ul className="mt-3 list-disc list-inside space-y-1 text-gray-300">
          <li>Open <b>/marketplaces</b>, install the extension, and connect it.</li>
          <li>
            Without it: Poshmark/Depop sync, sold-items capture, and the auto-delist walk
            all won't work.
          </li>
        </ul>
      </>
    ),
    cta: { label: 'Go to Marketplaces', href: '/marketplaces' },
  },
  {
    icon: Home,
    accent: 'text-blue-300',
    gradient: 'from-blue-500/20 to-indigo-500/10',
    title: 'Your inventory lives in /closet',
    body: (
      <>
        <p>
          Every item — eBay-anchored — lives here with title, images, sizes, prices, and
          platform bindings (eBay listing id, Poshmark listing id, Depop listing id).
        </p>
        <ul className="mt-3 list-disc list-inside space-y-1 text-gray-300">
          <li>Search by title, SKU, or barcode; filter by status.</li>
          <li>Click an item to open its detail page (QR code shareable).</li>
          <li>Bulk-edit selection lets you change status, price, or location in one go.</li>
        </ul>
      </>
    ),
    cta: { label: 'Open Inventory', href: '/closet' },
  },
  {
    icon: ShoppingBag,
    accent: 'text-blue-300',
    gradient: 'from-blue-500/20 to-cyan-500/10',
    title: 'eBay is the stock anchor',
    body: (
      <>
        <p>
          eBay is the source of truth for stock quantity. You import your eBay listings,
          and the eBay quantity is the number we start from. Poshmark and Depop are
          secondary — sales there decrement the eBay quantity.
        </p>
        <p className="mt-3 text-gray-400">
          Connect eBay on <b>/ebay</b> (OAuth + Trading API). The app keeps your eBay
          token fresh and syncs orders + listings on demand.
        </p>
      </>
    ),
    cta: { label: 'Go to eBay', href: '/ebay' },
  },
  {
    icon: Target,
    accent: 'text-pink-300',
    gradient: 'from-pink-500/20 to-rose-500/10',
    title: 'Calibrate the baseline (load-bearing)',
    body: (
      <>
        <p>
          Once your eBay quantities are correct, click <b>Calibrate</b> on <b>/closet</b>.
          That locks in the moment when stock was right. The whole stock model rides on it:
        </p>
        <pre className="mt-3 text-xs bg-gray-950/60 border border-gray-700/50 rounded p-3 text-cyan-200 font-mono whitespace-pre-wrap">{`real_stock = eBay qty
           − (Poshmark sales since baseline)
           − (Depop sales since baseline)
           − (eBay drops since baseline)`}</pre>
        <p className="mt-3 text-gray-400">
          Recalibrate only if data drifts (e.g. you bulk-edited eBay outside the app).
        </p>
      </>
    ),
  },
  {
    icon: ShoppingBag,
    accent: 'text-purple-300',
    gradient: 'from-purple-500/20 to-fuchsia-500/10',
    title: 'Poshmark integration',
    body: (
      <>
        <p>
          On <b>/poshmark</b>, the workflow is:
        </p>
        <ul className="mt-3 list-disc list-inside space-y-1 text-gray-300">
          <li><b>Refresh</b> — opens your closet + sales pages so the extension scrapes them.</li>
          <li><b>Import Listings</b> — adds Poshmark listings to inventory, matched to eBay items.</li>
          <li><b>Match</b> — fix any wrong eBay↔Poshmark bindings.</li>
          <li><b>Manage Sold</b> — auto-opens the sales page and pulls in recent Poshmark sales.</li>
          <li><b>Last Sold</b> + <b>New Sales Since Calibration</b> widgets surface the running sale list.</li>
        </ul>
      </>
    ),
    cta: { label: 'Go to Poshmark', href: '/poshmark' },
  },
  {
    icon: ShoppingBag,
    accent: 'text-red-300',
    gradient: 'from-red-500/20 to-orange-500/10',
    title: 'Depop integration',
    body: (
      <>
        <p>
          <b>/depop</b> works the same way: Refresh → Import → Match → Manage Sold. The
          extension drives your logged-in Depop session to capture sold items and to run
          the auto-delist macro on the <code>/manage/</code> page.
        </p>
        <p className="mt-3 text-gray-400">
          The two pages are mirror images of each other on purpose — once you know one,
          you know the other.
        </p>
      </>
    ),
    cta: { label: 'Go to Depop', href: '/depop' },
  },
  {
    icon: Coins,
    accent: 'text-emerald-300',
    gradient: 'from-emerald-500/20 to-green-500/10',
    title: 'Reconcile non-eBay sales',
    body: (
      <>
        <p>
          When new Poshmark/Depop sales come in, the <b>New Sales Since Calibration</b>{' '}
          widget on each integration page shows them. Click <b>Match &amp; reconcile</b>:
        </p>
        <ol className="mt-3 list-decimal list-inside space-y-1 text-gray-300">
          <li><b>Match</b> each sale to the right eBay item (top-3 candidates, reload, or manual pick).</li>
          <li><b>Preview</b> the per-item stock change (current eBay qty → new qty).</li>
          <li><b>Submit</b> — pushes new quantities to eBay, flips rows to reconciled, re-baselines the items.</li>
          <li><b>Review OOS</b> — if a sale took an item to 0, end the eBay listing or delist on the other platform.</li>
        </ol>
      </>
    ),
  },
  {
    icon: AlertOctagon,
    accent: 'text-amber-300',
    gradient: 'from-amber-500/20 to-red-500/10',
    title: 'Delist queue & auto-delist',
    body: (
      <>
        <p>
          The <b>Pending delistings</b> widget on <b>/poshmark</b> and <b>/depop</b> lists
          items that are SOLD or ended on eBay but still listed on the other platform —
          this is oversell risk.
        </p>
        <ul className="mt-3 list-disc list-inside space-y-1 text-gray-300">
          <li>Select rows and click <b>Check &amp; delist selected</b>.</li>
          <li>
            The extension opens each listing in a background tab, drives the platform's
            own delete flow (Depop <code>/manage/</code>, Poshmark <code>/edit-listing</code> → Delete Listing → Yes), then clears the binding.
          </li>
          <li>Nothing is removed from the list unless we confirm the listing is gone.</li>
        </ul>
      </>
    ),
  },
  {
    icon: BookOpen,
    accent: 'text-gray-300',
    gradient: 'from-gray-500/20 to-slate-500/10',
    title: 'Sales tracker & Docs',
    body: (
      <>
        <p>
          <b>/sales</b> is the unified sales feed across all platforms with profit and
          margin breakdown.
        </p>
        <p className="mt-3">
          <b>/docs</b> has the deep architecture handbook (Architecture / Functions / Agent
          panes) — long-form reference when you need to dig into how something works under
          the hood.
        </p>
      </>
    ),
    cta: { label: 'Open Docs', href: '/docs' },
  },
  {
    icon: CheckCircle2,
    accent: 'text-green-300',
    gradient: 'from-green-500/20 to-emerald-500/10',
    title: "You're set",
    body: (
      <>
        <p>
          That's the tour. The mental model that ties it all together:
        </p>
        <p className="mt-3 px-3 py-2 rounded bg-gray-950/60 border border-gray-700/50 text-cyan-200 font-mono text-sm">
          real stock = eBay − non-eBay sales since baseline
        </p>
        <p className="mt-3">
          Calibrate, then keep matching + reconciling + delisting. Don't oversell.
        </p>
        <p className="mt-3 text-gray-400">
          Reopen this tour any time from the <b>?</b> button in the nav.
        </p>
      </>
    ),
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  // Slide direction for the step transition (1 = forward, -1 = back).
  const [dir, setDir] = useState(1);

  // Reset to step 0 every time we open. Closing → completion is up to the parent.
  useEffect(() => {
    if (open) { setIdx(0); setDir(1); }
  }, [open]);

  const step = STEPS[idx];
  const isLast = idx === STEPS.length - 1;
  const isFirst = idx === 0;

  const goNext = useCallback(() => {
    if (isLast) { onClose(); return; }
    setDir(1); setIdx((i) => Math.min(STEPS.length - 1, i + 1));
  }, [isLast, onClose]);

  const goBack = useCallback(() => {
    if (isFirst) return;
    setDir(-1); setIdx((i) => Math.max(0, i - 1));
  }, [isFirst]);

  // Keyboard: ← / → to navigate, Esc handled by Radix.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goNext, goBack]);

  const handleCta = () => {
    if (!step.cta) return;
    onClose();           // close before navigating so the page renders cleanly
    navigate(step.cta.href);
  };

  const Icon = step.icon;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[999] bg-black/75 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-[50%] top-[50%] z-[1000] w-[92vw] max-w-3xl translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Top bar: step counter + skip/close */}
          <div className="flex items-center justify-between px-6 pt-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-500">
              <span className="text-gray-300 font-semibold">Step {idx + 1}</span>
              <span>of</span>
              <span>{STEPS.length}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-100 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
              aria-label="Skip onboarding"
            >
              <span>Skip</span>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 px-6 mt-3">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setDir(i > idx ? 1 : -1); setIdx(i); }}
                aria-label={`Go to step ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? 'w-8 bg-cyan-400' : i < idx ? 'w-3 bg-gray-500' : 'w-3 bg-gray-700 hover:bg-gray-600'
                }`}
              />
            ))}
          </div>

          {/* Step body (animated) */}
          <div className="relative px-6 pt-5 pb-2 overflow-hidden" style={{ minHeight: 380 }}>
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={idx}
                custom={dir}
                initial={{ opacity: 0, x: dir * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -24 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <div className={`rounded-xl border border-gray-700/50 bg-gradient-to-br ${step.gradient} p-5 mb-4`}>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gray-900/60 border border-gray-700/50 flex items-center justify-center">
                      <Icon className={`h-6 w-6 ${step.accent}`} />
                    </div>
                    <h2 className="text-xl font-bold text-white">{step.title}</h2>
                  </div>
                </div>
                <div className="text-sm text-gray-200 leading-relaxed space-y-1">
                  {step.body}
                </div>
                {step.cta && (
                  <button
                    type="button"
                    onClick={handleCta}
                    className="mt-5 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600/60 text-gray-100 text-xs font-semibold transition-colors"
                  >
                    {step.cta.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer: Back / Next-or-Finish */}
          <div className="flex items-center justify-between gap-3 px-6 pb-5 pt-3 border-t border-gray-800">
            <button
              type="button"
              onClick={goBack}
              disabled={isFirst}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-gray-300 hover:text-gray-100 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                isLast
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {isLast ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Finish
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
