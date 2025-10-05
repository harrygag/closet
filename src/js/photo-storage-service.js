// Photo Storage Service - IndexedDB for photos (Riley - Sprint 6)
class PhotoStorageService {
    static DB_NAME = 'ClosetPhotoDB';
    static DB_VERSION = 1;
    static STORE_NAME = 'photos';
    static MAX_PHOTO_SIZE = 500 * 1024; // 500KB per photo
    static MAX_PHOTOS_PER_ITEM = 5;

    static db = null;

    // Initialize IndexedDB
    static async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    // Compress image to meet size requirements
    static async compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Resize if larger than 1200px
                    const maxDimension = 1200;
                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = (height / width) * maxDimension;
                            width = maxDimension;
                        } else {
                            width = (width / height) * maxDimension;
                            height = maxDimension;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Compress as JPEG with quality 0.8
                    canvas.toBlob((blob) => {
                        if (blob.size > this.MAX_PHOTO_SIZE) {
                            // If still too large, reduce quality
                            canvas.toBlob((blob2) => {
                                resolve(blob2);
                            }, 'image/jpeg', 0.6);
                        } else {
                            resolve(blob);
                        }
                    }, 'image/jpeg', 0.8);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Save photo to IndexedDB
    static async savePhoto(photoId, blob) {
        const db = await this.init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);

            const photo = {
                id: photoId,
                blob: blob,
                timestamp: new Date().toISOString(),
                size: blob.size
            };

            const request = store.put(photo);

            request.onsuccess = () => resolve({ success: true, photoId });
            request.onerror = () => reject(request.error);
        });
    }

    // Get photo from IndexedDB
    static async getPhoto(photoId) {
        const db = await this.init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.get(photoId);

            request.onsuccess = () => {
                if (request.result) {
                    const url = URL.createObjectURL(request.result.blob);
                    resolve(url);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Delete photo from IndexedDB
    static async deletePhoto(photoId) {
        const db = await this.init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.delete(photoId);

            request.onsuccess = () => resolve({ success: true });
            request.onerror = () => reject(request.error);
        });
    }

    // Get all photos for an item
    static async getPhotosForItem(photoIds) {
        const photoUrls = [];

        for (const photoId of photoIds) {
            const url = await this.getPhoto(photoId);
            if (url) {
                photoUrls.push({ id: photoId, url });
            }
        }

        return photoUrls;
    }

    // Get storage usage
    static async getStorageUsage() {
        const db = await this.init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const photos = request.result;
                const totalSize = photos.reduce((sum, photo) => sum + photo.size, 0);
                const count = photos.length;

                resolve({
                    count,
                    totalSize,
                    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                    limit: '~50MB (IndexedDB)'
                });
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Upload and compress photo
    static async uploadPhoto(file, itemId) {
        try {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                return { success: false, error: 'File must be an image' };
            }

            // Compress image
            const compressedBlob = await this.compressImage(file);

            // Generate unique photo ID
            const photoId = `photo_${itemId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Save to IndexedDB
            await this.savePhoto(photoId, compressedBlob);

            return {
                success: true,
                photoId,
                size: compressedBlob.size,
                sizeMB: (compressedBlob.size / (1024 * 1024)).toFixed(2)
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}
