import * as admin from 'firebase-admin';
import { EbayPhoto } from './types';

// Get storage lazily after admin is initialized
function getStorage() {
  return admin.storage();
}

/**
 * Download and backup photos from eBay to Firebase Storage
 * eBay photo URLs expire when listings end - we backup to preserve them
 */
export async function downloadAndBackupPhotos(
  userId: string,
  itemId: string,
  photoUrls: string[]
): Promise<{
  success: boolean;
  photosDownloaded: number;
  photosFailed: number;
  photos: EbayPhoto[];
  errors: Array<{ url: string; order: number; error: string }>;
}> {
  const errors: Array<{ url: string; order: number; error: string }> = [];
  const photos: EbayPhoto[] = [];

  if (!photoUrls || photoUrls.length === 0) {
    return {
      success: true,
      photosDownloaded: 0,
      photosFailed: 0,
      photos: [],
      errors: [],
    };
  }

  console.log(`[Photo Backup] Starting backup for ${photoUrls.length} photos (userId: ${userId}, itemId: ${itemId})`);

  // Download photos in parallel (max 3 at a time)
  const batchSize = 3;
  for (let i = 0; i < photoUrls.length; i += batchSize) {
    const batch = photoUrls.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((url, index) => downloadAndUploadPhoto(userId, itemId, url, i + index))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        if (result.value) {
          photos.push(result.value);
        }
      } else if (result.status === 'rejected') {
        const error = result.reason;
        const index = i + batch.indexOf(batch[batch.indexOf(batch[0])]); // Get original index
        errors.push({
          url: photoUrls[index] || 'unknown',
          order: index,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Sort photos by order
  photos.sort((a, b) => a.order - b.order);

  // Mark first as primary
  if (photos.length > 0) {
    photos[0].isPrimary = true;
  }

  const success = photos.length > 0;
  console.log(
    `[Photo Backup] Complete: ${photos.length} downloaded, ${errors.length} failed`
  );

  return {
    success,
    photosDownloaded: photos.length,
    photosFailed: errors.length,
    photos,
    errors,
  };
}

/**
 * Download single photo from eBay and upload to Firebase Storage
 */
async function downloadAndUploadPhoto(
  userId: string,
  itemId: string,
  ebayUrl: string,
  order: number
): Promise<EbayPhoto | null> {
  try {
    // Download photo from eBay with timeout
    const response = await fetchWithTimeout(ebayUrl, 30000);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Validate it's an image
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    const buffer = await response.arrayBuffer();
    const size = buffer.byteLength;

    // Check size limit (10MB)
    if (size > 10 * 1024 * 1024) {
      throw new Error(`Photo too large: ${size} bytes`);
    }

    // Generate filename from URL or use order number
    const filename = generateFilename(ebayUrl, order, contentType);
    const storagePath = `users/${userId}/items/${itemId}/photos/${order}_${filename}`;
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);

    // Upload to Firebase Storage
    await file.save(Buffer.from(buffer), {
      metadata: {
        contentType,
        metadata: {
          ebayUrl,
          uploadedAt: new Date().toISOString(),
          order: String(order),
        },
      },
    });

    console.log(`[Photo] Uploaded: ${storagePath} (${size} bytes)`);

    // Get signed download URL (valid for 7 days)
    const [downloadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      ebayUrl,
      firebaseStorageUrl: downloadUrl,
      firebaseStoragePath: `gs://${bucket.name}/${storagePath}`,
      order,
      isPrimary: order === 0,
      filename,
      uploadedAt: Date.now(),
      size,
      mimeType: contentType,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Photo] Failed to backup photo #${order}: ${errorMsg}`);
    throw error;
  }
}

/**
 * Fetch with timeout (eBay may be slow)
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate filename for storage
 */
function generateFilename(ebayUrl: string, order: number, contentType: string): string {
  const ext = getExtensionFromMimeType(contentType);

  // Try to extract filename from URL
  try {
    const url = new URL(ebayUrl);
    const path = url.pathname;
    const match = path.match(/([a-zA-Z0-9_-]+)\.\w+$/);
    if (match) {
      return `${match[1]}_${order}${ext}`;
    }
  } catch {
    // Invalid URL, use fallback
  }

  // Fallback: use order number
  return `photo_${order}${ext}`;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/avif': '.avif',
  };
  return map[mimeType] || '.jpg';
}
