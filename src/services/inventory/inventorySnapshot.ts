/**
 * InventorySnapshot service — append-only record of point-in-time totals.
 *
 * Collection: InventorySnapshot/{snapshotId}
 *
 * Calibrate writes one with reason='calibration'; reconcile-mode Sync Stock
 * writes one with reason='sync' on every run. The 'calibration' snapshot
 * is never mutated — it's the immutable baseline.
 */

import { collection, doc, getDocs, query, where, orderBy, limit, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/client';
import type { InventorySnapshot, InventorySnapshotTotals } from '../../types/inventorySnapshot';

const COLL = 'InventorySnapshot';

export interface WriteSnapshotInput {
  userId: string;
  reason: 'calibration' | 'sync';
  totals: InventorySnapshotTotals;
  saleSnapshotIds: string[];
  notes?: string;
}

export async function writeSnapshot(input: WriteSnapshotInput): Promise<string> {
  const ref = await addDoc(collection(db, COLL), {
    userId: input.userId,
    reason: input.reason,
    takenAt: new Date().toISOString(),
    totals: input.totals,
    saleSnapshotIds: input.saleSnapshotIds,
    ...(input.notes ? { notes: input.notes } : {}),
  });
  return ref.id;
}

export async function getLatestSnapshot(userId: string): Promise<InventorySnapshot | null> {
  const q = query(
    collection(db, COLL),
    where('userId', '==', userId),
    orderBy('takenAt', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as InventorySnapshot;
}

export async function getCalibrationSnapshot(userId: string): Promise<InventorySnapshot | null> {
  const q = query(
    collection(db, COLL),
    where('userId', '==', userId),
    where('reason', '==', 'calibration'),
    orderBy('takenAt', 'asc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as InventorySnapshot;
}

export async function listSnapshots(userId: string, max = 50): Promise<InventorySnapshot[]> {
  const q = query(
    collection(db, COLL),
    where('userId', '==', userId),
    orderBy('takenAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as InventorySnapshot));
}

// Avoid unused-import lint; doc is exported here for callers that need direct ref.
export { doc };
