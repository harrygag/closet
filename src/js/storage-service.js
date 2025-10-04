// Storage Service - localStorage Management with Error Handling (Multi-User Support)
class StorageService {
    static KEY = 'resellerClosetItems';

    static getStorageKey() {
        // Use AuthService if available, otherwise fallback to default key
        if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn()) {
            return AuthService.getCurrentUserStorageKey();
        }
        return this.KEY;
    }

    static saveItems(items) {
        try {
            const key = this.getStorageKey();
            localStorage.setItem(key, JSON.stringify(items));
            return { success: true };
        } catch (e) {
            console.error('Storage failed:', e);
            return { success: false, error: e };
        }
    }

    static loadItems() {
        try {
            const key = this.getStorageKey();
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Load failed:', e);
            return [];
        }
    }

    static clearItems() {
        try {
            const key = this.getStorageKey();
            localStorage.removeItem(key);
            return { success: true };
        } catch (e) {
            console.error('Clear failed:', e);
            return { success: false, error: e };
        }
    }
}
