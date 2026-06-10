/**
 * Onboarding completion is stored as a single timestamp on the user doc:
 * `users/{userId}.onboardingCompletedAt`. Missing = show the welcome tour
 * on next auth-resolve. Replay is always available via the ? button in the
 * nav (dispatches the OPEN_EVENT custom event).
 */

import { doc, getDoc, setDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { app } from './firebase/client';

const db = getFirestore(app);

export const OPEN_EVENT = 'closet:open-onboarding';

export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    return !!snap.exists() && !!snap.data()?.onboardingCompletedAt;
  } catch {
    // If we can't read, default to NOT shown — don't pester the user with the
    // tour on a transient Firestore error.
    return true;
  }
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  try {
    await setDoc(doc(db, 'users', userId), { onboardingCompletedAt: serverTimestamp() }, { merge: true });
  } catch {
    /* best-effort */
  }
}

export function openOnboarding(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
