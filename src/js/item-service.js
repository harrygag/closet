// Item Service - CRUD Operations
class ItemService {
    constructor() {
        this.items = [];
        this.availableTags = [
            'Hoodie',
            'Jersey',
            'Pullover/Jackets',
            'polo',
            'T-shirts',
            'Bottoms'
        ];
    }

    loadItems() {
        this.items = StorageService.loadItems();
        this.autoAssignHangerNumbers();
        return this.items;
    }

    // Auto-assign hanger numbers sequentially (1, 2, 3, 4, 5...)
    autoAssignHangerNumbers() {
        // Reassign ALL items with sequential numbers 1, 2, 3, 4, 5...
        this.items.forEach((item, index) => {
            item.hangerId = (index + 1).toString();
        });

        this.saveItems();
        console.log(`✅ Auto-assigned sequential hanger numbers 1-${this.items.length}`);
    }

    saveItems() {
        const result = StorageService.saveItems(this.items);

        // Auto-backup check (every 10 items)
        if (typeof BackupService !== 'undefined' && BackupService.shouldAutoBackup(this.items.length)) {
            BackupService.createBackup(this.items);
        }

        return result;
    }

    addItem(itemData) {
        // Auto-assign hanger number if not provided
        if (!itemData.hangerId || itemData.hangerId.trim() === '') {
            const existingNumbers = this.items
                .map(item => item.hangerId)
                .filter(id => id && !isNaN(parseInt(id)))
                .map(id => parseInt(id));

            const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
            itemData.hangerId = nextNumber.toString();
        }

        const newItem = {
            ...itemData,
            id: Date.now().toString(),
            dateAdded: new Date().toISOString()
        };
        this.items.push(newItem);
        this.saveItems();
        return newItem;
    }

    updateItem(itemId, itemData) {
        const index = this.items.findIndex(i => i.id === itemId);
        if (index !== -1) {
            const existingItem = this.items[index];
            this.items[index] = {
                ...itemData,
                id: itemId,
                dateAdded: existingItem.dateAdded
            };
            this.saveItems();
            return this.items[index];
        }
        return null;
    }

    async deleteItem(itemId) {
        const item = this.getItem(itemId);

        // Delete photos from IndexedDB (Sprint 6)
        if (item && item.photoIds && item.photoIds.length > 0) {
            for (const photoId of item.photoIds) {
                try {
                    await PhotoStorageService.deletePhoto(photoId);
                } catch (error) {
                    console.warn('Failed to delete photo:', photoId, error);
                }
            }
        }

        this.items = this.items.filter(i => i.id !== itemId);
        this.saveItems();
        return true;
    }

    getItem(itemId) {
        return this.items.find(i => i.id === itemId);
    }

    getAllItems() {
        return this.items;
    }

    getItemsByStatus(status) {
        if (status === 'all') return this.items;
        return this.items.filter(i => i.status === status);
    }

    getItemsByTag(tag) {
        if (tag === 'all') return this.items;
        return this.items.filter(i => i.tags && i.tags.includes(tag));
    }

    calculateNetProfit(cost, selling, fees) {
        const costPrice = parseFloat(cost) || 0;
        const sellingPrice = parseFloat(selling) || 0;
        const ebayFees = parseFloat(fees) || 0;
        return sellingPrice - costPrice - ebayFees;
    }

    replaceAllItems(newItems) {
        this.items = newItems;
        this.saveItems();
        return true;
    }
}
