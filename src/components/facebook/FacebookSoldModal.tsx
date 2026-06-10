/**
 * Facebook Marketplace Sold Modal — minimal v0 stub mirroring DepopSoldModal
 * shape. Reads `marketplaceData/facebook_sold_*` (written by the future
 * extension content script when the seller hits "Mark as sold" on a listing).
 * Until the FB extension scrape lands, this opens an empty state.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { ShoppingBag, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import type { FacebookListing } from '../../services/facebook/import';

const db = getFirestore(app);
const FB_BLUE = '#1877F2';
const FB_SELLING_URL =
  'https://www.facebook.com/marketplace/you/selling?referral_surface=seller_hub&status[0]=SOLD#autoScroll';

interface FacebookSoldModalProps {
  open: boolean;
  onClose: () => void;
}

export const FacebookSoldModal = ({ open, onClose }: FacebookSoldModalProps) => {
  const { user } = useAuthStore();
  const { items, initializeStore } = useItemStore();
  const [listings, setListings] = useState<FacebookListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureComplete, setCaptureComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (open && user && items.length === 0) initializeStore(user.id);
  }, [open, user, items.length, initializeStore]);

  const loadListings = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setListings([]);
    setStatusMessage('');
    try {
      const candidateDocIds = [`facebook_sold_${user.id}`, 'facebook_sold_me'];
      let data: any = null;
      for (const docId of candidateDocIds) {
        try {
          const snap = await getDoc(doc(db, 'marketplaceData', docId));
          if (snap.exists()) {
            const d = snap.data();
            if (Array.isArray(d.listings) && d.listings.length > 0) { data = d; break; }
          }
        } catch { /* keep trying */ }
      }
      if (!data) {
        try {
          const all = await getDocs(collection(db, 'marketplaceData'));
          for (const ds of all.docs) {
            if (!ds.id.startsWith('facebook_sold_')) continue;
            const d = ds.data();
            if (Array.isArray(d.listings) && d.listings.length > 0) { data = d; break; }
          }
        } catch {}
      }
      if (!data) {
        setStatusMessage('No Facebook sold items found yet. The extension scrape will populate this once wired.');
        return;
      }
      setListings(data.listings as FacebookListing[]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const startCapture = useCallback(async () => {
    if (!user) return;
    setListings([]);
    setCaptureComplete(false);
    setIsCapturing(true);
    setStatusMessage('Opening Facebook sold listings — leave the tab open while it scrolls.');
    window.open(FB_SELLING_URL, '_blank');
    setTimeout(() => window.focus(), 500);
    const t = setTimeout(() => {
      if (!mountedRef.current) return;
      loadListings().then(() => {
        if (mountedRef.current) { setIsCapturing(false); setCaptureComplete(true); }
      });
    }, 20000);
    timeoutRef.current = t;
  }, [user, loadListings]);

  useEffect(() => {
    if (!open || !user) return;
    startCapture();
    return () => {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    };
  }, [open, user]);

  const soldListings = useMemo(
    () => listings.filter((l: any) => l.sold || l.status === 'sold' || l.status === 'SOLD'),
    [listings],
  );

  return (
    <Modal open={open} onOpenChange={onClose} title="Sold Facebook Items" size="xl">
      <div className="flex flex-col h-[80vh]">
        <div className="flex-shrink-0 pb-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isCapturing ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: FB_BLUE }} />
                <span className="font-medium" style={{ color: FB_BLUE }}>
                  Capturing sold items… {listings.length > 0 ? `${listings.length} found` : ''}
                </span>
              </div>
            ) : captureComplete ? (
              <span className="text-emerald-400 font-medium">{soldListings.length} sold items loaded</span>
            ) : (
              <span className="text-gray-400 text-sm">{statusMessage}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { window.open(FB_SELLING_URL, '_blank'); setTimeout(() => window.focus(), 500); }}
            >
              <ExternalLink className="h-4 w-4 mr-1" /> Reopen Facebook
            </Button>
            <Button size="sm" variant="ghost" onClick={loadListings} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" onClick={startCapture} style={{ backgroundColor: FB_BLUE }}>
              Retry Capture
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          {soldListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingBag className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">No sold Facebook items found</p>
              <p className="text-sm mt-2 max-w-md text-center">
                When the extension scrape lands, your FB sold listings will surface here so they can
                be matched to inventory and decrement eBay stock.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {soldListings.map((l: any) => (
                <li key={l.listing_id || l.id} className="bg-gray-800/40 border border-gray-700/40 rounded-lg overflow-hidden">
                  {l.imageUrl ? (
                    <img src={l.imageUrl} alt="" className="w-full h-40 object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-40 bg-gray-800" />
                  )}
                  <div className="p-3">
                    <div className="text-sm text-gray-100 line-clamp-2">{l.title}</div>
                    <div className="text-xs text-emerald-300 mt-1">${l.price ?? '—'}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};
