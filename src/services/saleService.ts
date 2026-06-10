/**
 * Sale Service
 *
 * CRUD operations for sales tracking
 */

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import type { Sale, MarketplaceType, SaleSource } from '../types/sale';
import { createSale as createSaleData } from '../types/sale';
import { logSaleCreated } from './activityLog';

const db = getFirestore(app);
const salesCollection = collection(db, 'Sales');

/**
 * Create a new sale record
 */
export async function createSale(saleData: Omit<Sale, 'id'>): Promise<string> {
  try {
    const docRef = await addDoc(salesCollection, {
      ...saleData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating sale:', error);
    throw error;
  }
}

/**
 * Update an existing sale
 */
export async function updateSale(
  saleId: string,
  updates: Partial<Omit<Sale, 'id' | 'userId' | 'createdAt'>>
): Promise<void> {
  try {
    const saleRef = doc(salesCollection, saleId);
    await updateDoc(saleRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating sale:', error);
    throw error;
  }
}

/**
 * Delete a sale record
 */
export async function deleteSale(saleId: string): Promise<void> {
  try {
    const saleRef = doc(salesCollection, saleId);
    await deleteDoc(saleRef);
  } catch (error) {
    console.error('Error deleting sale:', error);
    throw error;
  }
}

/**
 * Get all sales for a user
 */
/**
 * Record a sale from any mark-as-sold path.
 * Handles duplicate prevention (same item + marketplace + same day).
 */
export interface RecordSaleParams {
  userId: string;
  itemId: string;
  itemName: string;
  itemImageUrl?: string;
  salePrice: number;       // cents
  costPrice: number;       // cents
  marketplace: MarketplaceType;
  saleSource: SaleSource;
  marketplaceUrl?: string;
  notes?: string;
  saleDate?: string;       // ISO string, defaults to now
}

export async function recordSale(params: RecordSaleParams): Promise<string> {
  try {
    const saleDate = params.saleDate || new Date().toISOString();

    // Duplicate prevention: check for existing sale for same item + marketplace today
    const dayStart = new Date(saleDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(saleDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dupQuery = query(
      salesCollection,
      where('itemId', '==', params.itemId),
      where('marketplace', '==', params.marketplace),
      where('userId', '==', params.userId),
      limit(20)
    );
    const dupSnap = await getDocs(dupQuery);
    const existingToday = dupSnap.docs.find(d => {
      const sd = d.data().saleDate;
      if (!sd) return false;
      const saleTime = new Date(sd).getTime();
      return saleTime >= dayStart.getTime() && saleTime <= dayEnd.getTime()
        && d.data().saleSource === params.saleSource;
    });

    if (existingToday) {
      console.log(`[recordSale] Duplicate prevented: ${params.itemName} (${params.saleSource})`);
      return existingToday.id;
    }

    const saleData = createSaleData({
      userId: params.userId,
      itemId: params.itemId,
      itemName: params.itemName,
      itemImageUrl: params.itemImageUrl,
      saleDate,
      salePrice: params.salePrice,
      costPrice: params.costPrice,
      marketplace: params.marketplace,
      marketplaceUrl: params.marketplaceUrl,
      notes: params.notes,
      saleSource: params.saleSource,
    });

    const docRef = await addDoc(salesCollection, {
      ...saleData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Log activity (fire-and-forget, don't block the sale)
    logSaleCreated(
      params.userId,
      docRef.id,
      params.itemId,
      params.itemName,
      params.salePrice,
      params.marketplace as any,
      params.salePrice - params.costPrice
    ).catch(e => console.error('[recordSale] Activity log failed:', e));

    console.log(`[recordSale] Created sale ${docRef.id} for ${params.itemName} (${params.saleSource})`);
    return docRef.id;
  } catch (error) {
    console.error('[recordSale] Failed:', error);
    throw error;
  }
}

export async function getSalesForUser(
  userId: string,
  limitCount: number = 500
): Promise<Sale[]> {
  try {
    const q = query(
      salesCollection,
      where('userId', '==', userId),
      orderBy('saleDate', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const sales: Sale[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      sales.push({
        id: doc.id,
        userId: data.userId,
        itemId: data.itemId,
        itemName: data.itemName,
        itemImageUrl: data.itemImageUrl,
        saleDate: data.saleDate,
        salePrice: data.salePrice,
        costPrice: data.costPrice,
        profit: data.profit,
        profitMargin: data.profitMargin,
        marketplace: data.marketplace,
        marketplaceUrl: data.marketplaceUrl,
        saleSource: data.saleSource || 'detail_page',
        delistStatus: data.delistStatus || { ebay: false, poshmark: false, depop: false },
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt,
        notes: data.notes,
      });
    });

    return sales;
  } catch (error) {
    console.error('Error fetching sales:', error);
    throw error;
  }
}

/**
 * Bulk delete sales
 */
export async function bulkDeleteSales(saleIds: string[]): Promise<void> {
  try {
    const deletePromises = saleIds.map((saleId) => {
      const saleRef = doc(salesCollection, saleId);
      return deleteDoc(saleRef);
    });

    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error bulk deleting sales:', error);
    throw error;
  }
}
