// Main App Coordinator - Orchestrates Services
class ResellerCloset {
    constructor() {
        // Initialize services
        this.itemService = new ItemService();
        this.filterService = new FilterService();
        this.uiService = new UIService();
        this.bulkService = new BulkOperationsService();
        this.closetViewService = new ClosetViewService(this.itemService); // Sprint 8
        this.bulkModeActive = false;
        this.currentView = 'cards'; // Sprint 8: 'cards' or 'closet'
        this.currentPhotos = []; // Sprint 6: Track photos for current item being edited

        this.init();
    }

    async init() {
        // Initialize IndexedDB for photos (Sprint 6)
        await PhotoStorageService.init();

        this.itemService.loadItems();
        this.setupEventListeners();
        this.render();
    }

    // Centralized Render Method
    render() {
        const allItems = this.itemService.getAllItems();
        const filteredItems = this.filterService.filterItems(allItems);
        const itemsGrid = document.getElementById('itemsGrid');
        
        if (!itemsGrid) {
            console.error('❌ itemsGrid element not found!');
            return;
        }

        // Sprint 8: Render based on current view mode
        if (this.currentView === 'closet') {
            // Render closet view
            itemsGrid.innerHTML = this.closetViewService.renderClosetView(filteredItems);
            this.closetViewService.setupDragAndDrop(itemsGrid);
        } else {
            // Render card view (original)
            this.uiService.renderItems(
                filteredItems,
                (itemId) => this.viewItem(itemId),
                this.bulkModeActive ? this.bulkService : null
            );
        }

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

        // Sprint 8: View Toggle Button (Cards ⟷ Closet)
        document.getElementById('viewToggleBtn').addEventListener('click', () => {
            this.toggleView();
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
        const listPriceInput = document.getElementById('listPrice');
        const costPriceInput = document.getElementById('costPrice');

        const calculateNetProfit = () => {
            const cost = parseFloat(costPriceInput.value) || 0;
            const selling = parseFloat(sellingPriceInput.value) || 0;
            const fees = parseFloat(ebayFeesInput.value) || 0;
            const netProfit = selling - cost - fees;

            document.getElementById('netProfitDisplay').value = netProfit >= 0
                ? `+$${netProfit.toFixed(2)}`
                : `-$${Math.abs(netProfit).toFixed(2)}`;

            // Color code the profit
            const profitDisplay = document.getElementById('netProfitDisplay');
            if (netProfit > 0) {
                profitDisplay.style.background = 'rgba(0,255,0,0.2)';
                profitDisplay.style.color = 'var(--retro-green)';
            } else if (netProfit < 0) {
                profitDisplay.style.background = 'rgba(255,0,0,0.2)';
                profitDisplay.style.color = 'var(--retro-red)';
            } else {
                profitDisplay.style.background = 'rgba(255,255,255,0.1)';
                profitDisplay.style.color = 'var(--retro-gray)';
            }
        };

        costPriceInput.addEventListener('input', calculateNetProfit);
        sellingPriceInput.addEventListener('input', calculateNetProfit);
        listPriceInput.addEventListener('input', calculateNetProfit);
        ebayFeesInput.addEventListener('input', calculateNetProfit);

        // Close modal on background click
        document.getElementById('itemModal').addEventListener('click', (e) => {
            if (e.target.id === 'itemModal') {
                this.uiService.closeModal('itemModal');
                this.clearPhotoUpload();
            }
        });

        document.getElementById('viewModal').addEventListener('click', (e) => {
            if (e.target.id === 'viewModal') {
                this.uiService.closeModal('viewModal');
            }
        });

        // Photo upload (Sprint 6)
        const photoUploadZone = document.getElementById('photoUploadZone');
        const photoInput = document.getElementById('photoInput');

        // Click upload zone to open file picker
        photoUploadZone.addEventListener('click', () => {
            photoInput.click();
        });

        // File input change
        photoInput.addEventListener('change', (e) => {
            this.handlePhotoUpload(e.target.files);
        });

        // Drag and drop
        photoUploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            photoUploadZone.classList.add('drag-over');
        });

        photoUploadZone.addEventListener('dragleave', () => {
            photoUploadZone.classList.remove('drag-over');
        });

        photoUploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            photoUploadZone.classList.remove('drag-over');
            this.handlePhotoUpload(e.dataTransfer.files);
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

        // Validate unique hanger ID
        if (formData.hangerId) {
            const existingItem = this.itemService.getAllItems().find(item =>
                item.hangerId === formData.hangerId && item.id !== formData.id
            );

            if (existingItem) {
                alert(`❌ Hanger ID "${formData.hangerId}" is already in use by "${existingItem.name}"!\nEach hanger must have a unique ID.`);
                return;
            }
        }

        // Add photoIds (Sprint 6)
        formData.photoIds = this.currentPhotos.map(p => p.id);

        if (formData.id) {
            // Update existing item
            this.itemService.updateItem(formData.id, formData);
        } else {
            // Add new item
            this.itemService.addItem(formData);
        }

        this.uiService.closeModal('itemModal');
        this.clearPhotoUpload();
        this.render();
        this.uiService.playSuccessAnimation();
    }

    async viewItem(itemId) {
        const item = this.itemService.getItem(itemId);
        if (item) {
            await this.uiService.renderItemDetails(item);
        }
    }

    // Sprint 8: Toggle between Cards and Closet view
    toggleView() {
        console.log('🔄 Toggle view called. Current:', this.currentView);
        this.currentView = this.currentView === 'cards' ? 'closet' : 'cards';
        this.closetViewService.currentView = this.currentView;
        console.log('🔄 New view:', this.currentView);

        // Update toggle button
        const toggleBtn = document.getElementById('viewToggleBtn');
        const toggleIcon = document.getElementById('viewToggleIcon');
        const toggleText = document.getElementById('viewToggleText');

        if (this.currentView === 'closet') {
            toggleIcon.textContent = '📇';
            toggleText.textContent = 'CARD VIEW';
            console.log('✅ Switched to CLOSET view');
        } else {
            toggleIcon.textContent = '👔';
            toggleText.textContent = 'CLOSET VIEW';
            console.log('✅ Switched to CARD view');
        }

        // Re-render with new view
        console.log('🎨 Re-rendering...');
        this.render();
        console.log('✅ Render complete');
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

    // Photo Upload Handlers (Sprint 6 Phase 2)
    async handlePhotoUpload(files) {
        const maxPhotos = 5;
        const remainingSlots = maxPhotos - this.currentPhotos.length;

        if (remainingSlots <= 0) {
            alert('❌ Max 5 photos per item!');
            return;
        }

        const filesToUpload = Array.from(files).slice(0, remainingSlots);
        const currentItemId = document.getElementById('itemId').value || 'temp_' + Date.now();

        for (const file of filesToUpload) {
            try {
                const result = await PhotoStorageService.uploadPhoto(file, currentItemId);

                if (result.success) {
                    this.currentPhotos.push({
                        id: result.photoId,
                        file: file,
                        size: result.size
                    });
                } else {
                    alert(`❌ Failed to upload ${file.name}: ${result.error}`);
                }
            } catch (error) {
                alert(`❌ Error uploading ${file.name}`);
            }
        }

        this.renderPhotoPreview();
    }

    async renderPhotoPreview() {
        const previewContainer = document.getElementById('photoPreviewContainer');
        const previewGrid = document.getElementById('photoPreviewGrid');

        if (this.currentPhotos.length === 0) {
            previewContainer.style.display = 'none';
            return;
        }

        previewContainer.style.display = 'block';
        previewGrid.innerHTML = '';

        for (const photo of this.currentPhotos) {
            const photoUrl = await PhotoStorageService.getPhoto(photo.id);

            const photoItem = document.createElement('div');
            photoItem.className = 'photo-preview-item';
            photoItem.innerHTML = `
                <img src="${photoUrl}" alt="Photo preview">
                <button class="photo-preview-delete" data-photo-id="${photo.id}" type="button">✕</button>
            `;

            photoItem.querySelector('.photo-preview-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePhotoPreview(photo.id);
            });

            previewGrid.appendChild(photoItem);
        }
    }

    async deletePhotoPreview(photoId) {
        // Remove from IndexedDB
        await PhotoStorageService.deletePhoto(photoId);

        // Remove from current photos array
        this.currentPhotos = this.currentPhotos.filter(p => p.id !== photoId);

        // Re-render preview
        this.renderPhotoPreview();
    }

    clearPhotoUpload() {
        this.currentPhotos = [];
        const previewContainer = document.getElementById('photoPreviewContainer');
        previewContainer.style.display = 'none';
        document.getElementById('photoInput').value = '';
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ResellerCloset(); // Sprint 8: Make accessible for closet view
    window.resellerCloset = window.app; // Keep backward compatibility
});
