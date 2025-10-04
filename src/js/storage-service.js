// Storage Service - localStorage Management with Error Handling
class StorageService {
    static KEY = 'resellerClosetItems';

    static saveItems(items) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(items));
            return { success: true };
        } catch (e) {
            console.error('Storage failed:', e);
            return { success: false, error: e };
        }
    }

    static loadItems() {
        try {
            const stored = localStorage.getItem(this.KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Load failed:', e);
            return [];
        }
    }

    static clearItems() {
        try {
            localStorage.removeItem(this.KEY);
            return { success: true };
        } catch (e) {
            console.error('Clear failed:', e);
            return { success: false, error: e };
        }
    }
}
