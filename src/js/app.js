// Main App Coordinator - Orchestrates Services
class ResellerCloset {
    constructor() {
        // Initialize services
        this.itemService = new ItemService();
        this.filterService = new FilterService();
        this.uiService = new UIService();

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

        this.uiService.renderItems(filteredItems, (itemId) => this.viewItem(itemId));
        this.uiService.updateStats(allItems);
        this.uiService.updateLevelBar(allItems);
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
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ResellerCloset();
});
