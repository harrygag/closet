// Main App Coordinator - Orchestrates Services
class ResellerCloset {
    constructor() {
        // Initialize services
        this.itemService = new ItemService();
        this.filterService = new FilterService();
        this.uiService = new UIService();
        this.bulkService = new BulkOperationsService();
        this.bulkModeActive = false;

        this.init();
    }

    init() {
        this.itemService.loadItems();
        this.setupEventListeners();
        this.render();
    }

    // Centralized Render Method
    render() {
        const allItems = this.itemService.getAllItems();
        const filteredItems = this.filterService.filterItems(allItems);

        this.uiService.renderItems(
            filteredItems,
            (itemId) => this.viewItem(itemId),
            this.bulkModeActive ? this.bulkService : null
        );
        this.uiService.updateStats(allItems);
        this.uiService.updateLevelBar(allItems);
        this.updateBulkPanel(filteredItems);
    }

    updateBulkPanel(filteredItems) {
        const count = this.bulkService.getSelectedCount();
        document.getElementById('bulkSelectedCount').textContent = `${count} SELECTED`;

        if (count > 0 && !this.bulkModeActive) {
            this.bulkModeActive = true;
            document.getElementById('bulkPanel').style.display = 'block';
            this.render(); // Re-render to show checkboxes
        } else if (count === 0 && this.bulkModeActive) {
            this.bulkModeActive = false;
            document.getElementById('bulkPanel').style.display = 'none';
            this.render(); // Re-render to hide checkboxes
        }
    }

    // Event Listeners Setup
    setupEventListeners() {
        // Add button
        document.getElementById('addBtn').addEventListener('click', () => {
            this.openModal();
        });

        // Export button
        document.getElementById('exportBtn').addEventListener('click', () => {
            const items = this.itemService.getAllItems();
            ExportService.exportToJSON(items);
        });

        // Import button
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });

        // Backup Manager button
        document.getElementById('backupBtn').addEventListener('click', () => {
            this.openBackupManager();
        });

        // Close backup modal
        document.getElementById('closeBackupModal').addEventListener('click', () => {
            this.uiService.closeModal('backupModal');
        });

        // Create backup button
        document.getElementById('createBackupBtn').addEventListener('click', () => {
            const items = this.itemService.getAllItems();
            const result = BackupService.createBackup(items);
            if (result.success) {
                alert(`✅ Backup created! (${items.length} items)`);
                this.renderBackupsList();
            } else {
                alert(`❌ Backup failed: ${result.error}`);
            }
        });

        // File input change
        document.getElementById('importFileInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const result = await ImportService.importFromJSON(file);
                if (result.success) {
                    this.itemService.replaceAllItems(result.items);
                    this.render();
                    alert(`✅ Successfully imported ${result.count} items!`);
                }
            } catch (error) {
                alert(`❌ Import failed: ${error.error}`);
            }

            // Reset file input
            e.target.value = '';
        });

        // Close modals
        document.getElementById('closeModal').addEventListener('click', () => {
            this.uiService.closeModal('itemModal');
        });

        document.getElementById('closeViewModal').addEventListener('click', () => {
            this.uiService.closeModal('viewModal');
        });

        // Cancel button
        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.uiService.closeModal('itemModal');
        });

        // Form submit
        document.getElementById('itemForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveItem();
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filterService.setSearchQuery(e.target.value);
            this.render();
        });

        // Status filter buttons
        document.querySelectorAll('.filter-buttons .retro-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-buttons .retro-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterService.setStatusFilter(e.target.dataset.status);
                this.render();
            });
        });

        // Tag filter tabs
        document.querySelectorAll('.category-tabs .tab-btn').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.category-tabs .tab-btn').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.filterService.setTagFilter(e.target.dataset.category);
                this.render();
            });
        });

        // Sort dropdown
        document.getElementById('sortSelect').addEventListener('change', (e) => {
            const sortValue = e.target.value;
            if (sortValue) {
                const [sortBy, sortOrder] = sortValue.split('-');
                this.filterService.setSortOptions(sortBy, sortOrder);
            } else {
                this.filterService.setSortOptions(null, null);
            }
            this.render();
        });

        // Edit and Delete buttons
        document.getElementById('editBtn').addEventListener('click', () => {
            this.uiService.closeModal('viewModal');
            const item = this.itemService.getItem(this.uiService.currentEditId);
            this.openModal(item);
        });

        document.getElementById('deleteBtn').addEventListener('click', () => {
            if (confirm('DELETE THIS ITEM? (NO UNDO)')) {
                this.itemService.deleteItem(this.uiService.currentEditId);
                this.uiService.closeModal('viewModal');
                this.render();
            }
        });

        // Net profit calculator
        const ebayFeesInput = document.getElementById('ebayFees');
        const sellingPriceInput = document.getElementById('sellingPrice');
        const costPriceInput = document.getElementById('costPrice');

        const calculateNetProfit = () => {
            const cost = costPriceInput.value;
            const selling = sellingPriceInput.value;
            const fees = ebayFeesInput.value;
            this.uiService.updateNetProfitDisplay(cost, selling, fees);
        };

        costPriceInput.addEventListener('input', calculateNetProfit);
        sellingPriceInput.addEventListener('input', calculateNetProfit);
        ebayFeesInput.addEventListener('input', calculateNetProfit);

        // Close modal on background click
        document.getElementById('itemModal').addEventListener('click', (e) => {
            if (e.target.id === 'itemModal') {
                this.uiService.closeModal('itemModal');
            }
        });

        document.getElementById('viewModal').addEventListener('click', (e) => {
            if (e.target.id === 'viewModal') {
                this.uiService.closeModal('viewModal');
            }
        });

        // Bulk operations
        document.getElementById('itemsGrid').addEventListener('change', (e) => {
            if (e.target.classList.contains('item-checkbox')) {
                const itemId = e.target.dataset.id;
                this.bulkService.toggleItem(itemId);
                this.render();
            }
        });

        document.getElementById('bulkSelectAll').addEventListener('click', () => {
            const allItems = this.filterService.filterItems(this.itemService.getAllItems());
            const itemIds = allItems.map(item => item.id);
            this.bulkService.selectAll(itemIds);
            this.render();
        });

        document.getElementById('bulkDeselectAll').addEventListener('click', () => {
            this.bulkService.deselectAll();
            this.render();
        });

        document.getElementById('bulkStatusChange').addEventListener('change', (e) => {
            const newStatus = e.target.value;
            if (newStatus && this.bulkService.getSelectedCount() > 0) {
                if (confirm(`Change status of ${this.bulkService.getSelectedCount()} items to ${newStatus}?`)) {
                    this.bulkService.bulkUpdateStatus(this.itemService, newStatus);
                    this.render();
                }
                e.target.value = ''; // Reset dropdown
            }
        });

        document.getElementById('bulkExportSelected').addEventListener('click', () => {
            const items = this.bulkService.bulkExport(this.itemService);
            if (items.length > 0) {
                ExportService.exportToJSON(items, `closet-export-${items.length}-items.json`);
            } else {
                alert('No items selected for export');
            }
        });

        document.getElementById('bulkDeleteSelected').addEventListener('click', () => {
            const count = this.bulkService.getSelectedCount();
            if (count > 0) {
                if (confirm(`DELETE ${count} ITEMS? (NO UNDO)`)) {
                    this.bulkService.bulkDelete(this.itemService);
                    this.render();
                }
            }
        });
    }

    // Modal Actions
    openModal(item = null) {
        this.uiService.openModal(item);
    }

    // CRUD Operations
    saveItem() {
        const formData = this.uiService.getFormData();

        if (formData.id) {
            // Update existing item
            this.itemService.updateItem(formData.id, formData);
        } else {
            // Add new item
            this.itemService.addItem(formData);
        }

        this.uiService.closeModal('itemModal');
        this.render();
        this.uiService.playSuccessAnimation();
    }

    viewItem(itemId) {
        const item = this.itemService.getItem(itemId);
        if (item) {
            this.uiService.renderItemDetails(item);
        }
    }

    // Backup Manager (Riley + Alex - Sprint 5)
    openBackupManager() {
        document.getElementById('backupModal').classList.add('active');
        this.renderBackupsList();
    }

    renderBackupsList() {
        const backups = BackupService.getAllBackups();
        const backupsList = document.getElementById('backupsList');
        const noBackups = document.getElementById('noBackups');

        if (backups.length === 0) {
            backupsList.innerHTML = '';
            noBackups.style.display = 'block';
            return;
        }

        noBackups.style.display = 'none';

        backupsList.innerHTML = backups.map(backup => {
            const date = new Date(backup.timestamp);
            const dateStr = date.toLocaleString();

            return `
                <div style="
                    background: var(--retro-purple);
                    border: 2px solid var(--retro-cyan);
                    padding: 15px;
                    margin-bottom: 10px;
                    border-radius: 5px;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div>
                            <div class="pixel-small" style="color: var(--retro-cyan);">
                                📅 ${dateStr}
                            </div>
                            <div style="font-size: 12px; color: var(--retro-gray); margin-top: 5px;">
                                👤 ${backup.user} • 📦 ${backup.itemCount} items
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button
                            class="retro-btn-small"
                            onclick="window.resellerCloset.restoreBackup('${backup.key}')"
                            style="flex: 1; background: var(--retro-green);"
                        >
                            ↩️ RESTORE
                        </button>
                        <button
                            class="retro-btn-small"
                            onclick="window.resellerCloset.deleteBackup('${backup.key}')"
                            style="background: var(--retro-red);"
                        >
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    restoreBackup(backupKey) {
        if (confirm('RESTORE THIS BACKUP? Current items will be replaced.')) {
            const result = BackupService.restoreBackup(backupKey);
            if (result.success) {
                this.itemService.replaceAllItems(result.items);
                this.render();
                this.uiService.closeModal('backupModal');
                alert(`✅ Restored ${result.items.length} items!`);
            } else {
                alert(`❌ Restore failed: ${result.error}`);
            }
        }
    }

    deleteBackup(backupKey) {
        if (confirm('DELETE THIS BACKUP?')) {
            localStorage.removeItem(backupKey);
            this.renderBackupsList();
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.resellerCloset = new ResellerCloset();
});
