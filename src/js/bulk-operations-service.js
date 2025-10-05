// Bulk Operations Service - Multi-select and bulk actions
class BulkOperationsService {
    constructor() {
        this.selectedItems = new Set();
    }

    toggleItem(itemId) {
        if (this.selectedItems.has(itemId)) {
            this.selectedItems.delete(itemId);
        } else {
            this.selectedItems.add(itemId);
        }
        return this.selectedItems.has(itemId);
    }

    selectAll(itemIds) {
        itemIds.forEach(id => this.selectedItems.add(id));
        return this.selectedItems.size;
    }

    deselectAll() {
        this.selectedItems.clear();
        return 0;
    }

    getSelectedItems() {
        return Array.from(this.selectedItems);
    }

    getSelectedCount() {
        return this.selectedItems.size;
    }

    isSelected(itemId) {
        return this.selectedItems.has(itemId);
    }

    bulkDelete(itemService) {
        const selectedIds = this.getSelectedItems();
        let deletedCount = 0;

        selectedIds.forEach(id => {
            if (itemService.deleteItem(id)) {
                deletedCount++;
            }
        });

        this.deselectAll();
        return { success: true, count: deletedCount };
    }

    bulkUpdateStatus(itemService, newStatus) {
        const selectedIds = this.getSelectedItems();
        let updatedCount = 0;

        selectedIds.forEach(id => {
            const item = itemService.getItem(id);
            if (item) {
                itemService.updateItem(id, { ...item, status: newStatus });
                updatedCount++;
            }
        });

        this.deselectAll();
        return { success: true, count: updatedCount };
    }

    bulkExport(itemService) {
        const selectedIds = this.getSelectedItems();
        const items = selectedIds
            .map(id => itemService.getItem(id))
            .filter(item => item !== null);

        return items;
    }
}
