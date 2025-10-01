// Reseller Closet App - Based on Notion Database Structure
class ResellerCloset {
    constructor() {
        this.items = [];
        this.currentStatusFilter = 'all';
        this.currentTagFilter = 'all';
        this.searchQuery = '';
        this.currentEditId = null;
        
        // Tag options from Notion
        this.availableTags = [
            'Hoodie',
            'Jersey', 
            'Pullover/Jackets',
            'polo',
            'T-shirts',
            'Bottoms'
        ];
        
        this.init();
    }

    init() {
        this.loadItems();
        this.setupEventListeners();
        this.renderItems();
        this.updateStats();
        this.updateLevelBar();
    }

    // Local Storage Management
    loadItems() {
        const stored = localStorage.getItem('resellerClosetItems');
        this.items = stored ? JSON.parse(stored) : [];
    }

    saveItems() {
        localStorage.setItem('resellerClosetItems', JSON.stringify(this.items));
    }

    // Event Listeners
    setupEventListeners() {
        // Add button
        document.getElementById('addBtn').addEventListener('click', () => {
            this.openModal();
        });

        // Close modals
        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeModal('itemModal');
        });

        document.getElementById('closeViewModal').addEventListener('click', () => {
            this.closeModal('viewModal');
        });

        // Cancel button
        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.closeModal('itemModal');
        });

        // Form submit
        document.getElementById('itemForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveItem();
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderItems();
        });

        // Status filter buttons
        document.querySelectorAll('.filter-buttons .retro-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-buttons .retro-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentStatusFilter = e.target.dataset.status;
                this.renderItems();
            });
        });

        // Tag filter tabs
        document.querySelectorAll('.category-tabs .tab-btn').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.category-tabs .tab-btn').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.currentTagFilter = e.target.dataset.category;
                this.renderItems();
            });
        });

        // Edit and Delete buttons
        document.getElementById('editBtn').addEventListener('click', () => {
            this.closeModal('viewModal');
            this.openModal(this.currentEditId);
        });

        document.getElementById('deleteBtn').addEventListener('click', () => {
            if (confirm('DELETE THIS ITEM? (NO UNDO)')) {
                this.deleteItem(this.currentEditId);
                this.closeModal('viewModal');
            }
        });

        // Auto-calculate net profit
        const ebayFeesInput = document.getElementById('ebayFees');
        const sellingPriceInput = document.getElementById('sellingPrice');
        const costPriceInput = document.getElementById('costPrice');
        const netProfitDisplay = document.getElementById('netProfitDisplay');

        const calculateNetProfit = () => {
            const cost = parseFloat(costPriceInput.value) || 0;
            const selling = parseFloat(sellingPriceInput.value) || 0;
            const fees = parseFloat(ebayFeesInput.value) || 0;
            const netProfit = selling - cost - fees;
            netProfitDisplay.value = netProfit > 0 ? `+$${netProfit.toFixed(2)}` : netProfit < 0 ? `-$${Math.abs(netProfit).toFixed(2)}` : '$0.00';
            netProfitDisplay.style.color = netProfit > 0 ? 'var(--retro-green)' : netProfit < 0 ? 'var(--retro-red)' : 'var(--retro-cyan)';
        };

        costPriceInput.addEventListener('input', calculateNetProfit);
        sellingPriceInput.addEventListener('input', calculateNetProfit);
        ebayFeesInput.addEventListener('input', calculateNetProfit);

        // Close modal on background click
        document.getElementById('itemModal').addEventListener('click', (e) => {
            if (e.target.id === 'itemModal') {
                this.closeModal('itemModal');
            }
        });

        document.getElementById('viewModal').addEventListener('click', (e) => {
            if (e.target.id === 'viewModal') {
                this.closeModal('viewModal');
            }
        });
    }

    // Modal Management
    openModal(itemId = null) {
        const modal = document.getElementById('itemModal');
        const form = document.getElementById('itemForm');
        const title = document.getElementById('modalTitle');

        if (itemId) {
            // Edit mode
            title.textContent = 'EDIT ITEM';
            const item = this.items.find(i => i.id === itemId);
            if (item) {
                document.getElementById('itemId').value = item.id;
                document.getElementById('itemName').value = item.name;
                document.getElementById('size').value = item.size || '';
                document.getElementById('status').value = item.status;
                document.getElementById('hangerStatus').value = item.hangerStatus || '';
                document.getElementById('hangerId').value = item.hangerId || '';
                
                // Set tags checkboxes
                document.querySelectorAll('input[name="tags"]').forEach(checkbox => {
                    checkbox.checked = item.tags && item.tags.includes(checkbox.value);
                });
                
                document.getElementById('ebayUrl').value = item.ebayUrl || '';
                document.getElementById('costPrice').value = item.costPrice || '';
                document.getElementById('sellingPrice').value = item.sellingPrice || '';
                document.getElementById('ebayFees').value = item.ebayFees || '';
                document.getElementById('dateField').value = item.dateField || '';
                document.getElementById('notes').value = item.notes || '';
                
                // Trigger net profit calculation
                const event = new Event('input');
                document.getElementById('costPrice').dispatchEvent(event);
            }
        } else {
            // Add mode
            title.textContent = 'ADD NEW ITEM';
            form.reset();
            document.getElementById('itemId').value = '';
            document.getElementById('netProfitDisplay').value = '$0.00';
        }

        modal.classList.add('active');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('active');
        if (modalId === 'itemModal') {
            document.getElementById('itemForm').reset();
        }
    }

    // CRUD Operations
    saveItem() {
        const itemId = document.getElementById('itemId').value;
        const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
        const sellingPrice = parseFloat(document.getElementById('sellingPrice').value) || 0;
        const ebayFees = parseFloat(document.getElementById('ebayFees').value) || 0;
        
        // Get selected tags
        const selectedTags = [];
        document.querySelectorAll('input[name="tags"]:checked').forEach(checkbox => {
            selectedTags.push(checkbox.value);
        });
        
        const itemData = {
            id: itemId || Date.now().toString(),
            name: document.getElementById('itemName').value,
            size: document.getElementById('size').value,
            status: document.getElementById('status').value,
            hangerStatus: document.getElementById('hangerStatus').value,
            hangerId: document.getElementById('hangerId').value,
            tags: selectedTags,
            ebayUrl: document.getElementById('ebayUrl').value,
            costPrice: costPrice,
            sellingPrice: sellingPrice,
            ebayFees: ebayFees,
            netProfit: sellingPrice - costPrice - ebayFees,
            dateField: document.getElementById('dateField').value,
            notes: document.getElementById('notes').value,
            dateAdded: itemId ? this.items.find(i => i.id === itemId).dateAdded : new Date().toISOString()
        };

        if (itemId) {
            // Update existing item
            const index = this.items.findIndex(i => i.id === itemId);
            this.items[index] = itemData;
        } else {
            // Add new item
            this.items.push(itemData);
        }

        this.saveItems();
        this.renderItems();
        this.updateStats();
        this.updateLevelBar();
        this.closeModal('itemModal');
        
        this.playSuccessSound();
    }

    deleteItem(itemId) {
        this.items = this.items.filter(i => i.id !== itemId);
        this.saveItems();
        this.renderItems();
        this.updateStats();
        this.updateLevelBar();
    }

    viewItem(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;

        this.currentEditId = itemId;
        
        const detailsDiv = document.getElementById('itemDetails');
        const netProfit = item.netProfit || 0;
        const profitClass = netProfit > 0 ? 'profit' : netProfit < 0 ? 'loss' : '';
        
        detailsDiv.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">NAME</span>
                <span class="detail-value">${item.name}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">STATUS</span>
                <span class="detail-value status-${item.status.toLowerCase().replace(' ', '-')}">${item.status.toUpperCase()}</span>
            </div>
            ${item.size ? `
                <div class="detail-row">
                    <span class="detail-label">SIZE</span>
                    <span class="detail-value">${item.size}</span>
                </div>
            ` : ''}
            ${item.tags && item.tags.length > 0 ? `
                <div class="detail-row">
                    <span class="detail-label">TAGS</span>
                    <span class="detail-value">${item.tags.join(', ')}</span>
                </div>
            ` : ''}
            ${item.hangerId ? `
                <div class="detail-row">
                    <span class="detail-label">HANGER ID</span>
                    <span class="detail-value">${item.hangerId}</span>
                </div>
            ` : ''}
            ${item.hangerStatus ? `
                <div class="detail-row">
                    <span class="detail-label">HANGER STATUS</span>
                    <span class="detail-value">${item.hangerStatus}</span>
                </div>
            ` : ''}
            ${item.costPrice ? `
                <div class="detail-row">
                    <span class="detail-label">COST</span>
                    <span class="detail-value">$${item.costPrice.toFixed(2)}</span>
                </div>
            ` : ''}
            ${item.sellingPrice ? `
                <div class="detail-row">
                    <span class="detail-label">SELLING PRICE</span>
                    <span class="detail-value">$${item.sellingPrice.toFixed(2)}</span>
                </div>
            ` : ''}
            ${item.ebayFees ? `
                <div class="detail-row">
                    <span class="detail-label">EBAY FEES</span>
                    <span class="detail-value">$${item.ebayFees.toFixed(2)}</span>
                </div>
            ` : ''}
            ${item.costPrice || item.sellingPrice ? `
                <div class="detail-row">
                    <span class="detail-label">NET PROFIT</span>
                    <span class="detail-value ${profitClass}">${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)}</span>
                </div>
            ` : ''}
            ${item.ebayUrl ? `
                <div class="detail-row">
                    <span class="detail-label">EBAY LISTING</span>
                    <span class="detail-value"><a href="${item.ebayUrl}" target="_blank">VIEW</a></span>
                </div>
            ` : ''}
            ${item.dateField ? `
                <div class="detail-row">
                    <span class="detail-label">DATE</span>
                    <span class="detail-value">${new Date(item.dateField).toLocaleDateString()}</span>
                </div>
            ` : ''}
            ${item.notes ? `
                <div class="detail-row">
                    <span class="detail-label">NOTES</span>
                    <span class="detail-value">${item.notes}</span>
                </div>
            ` : ''}
            <div class="detail-row">
                <span class="detail-label">DATE ADDED</span>
                <span class="detail-value">${new Date(item.dateAdded).toLocaleDateString()}</span>
            </div>
        `;

        document.getElementById('viewModal').classList.add('active');
    }

    // Rendering
    renderItems() {
        const container = document.getElementById('itemsGrid');
        const emptyState = document.getElementById('emptyState');
        
        // Filter items
        let filteredItems = this.items.filter(item => {
            const matchesStatus = this.currentStatusFilter === 'all' || item.status === this.currentStatusFilter;
            const matchesTag = this.currentTagFilter === 'all' || (item.tags && item.tags.includes(this.currentTagFilter));
            const matchesSearch = !this.searchQuery || 
                item.name.toLowerCase().includes(this.searchQuery) ||
                (item.size && item.size.toLowerCase().includes(this.searchQuery)) ||
                (item.hangerId && item.hangerId.toLowerCase().includes(this.searchQuery)) ||
                (item.tags && item.tags.some(tag => tag.toLowerCase().includes(this.searchQuery)));
            
            return matchesStatus && matchesTag && matchesSearch;
        });

        if (filteredItems.length === 0) {
            emptyState.classList.remove('hidden');
            container.innerHTML = '';
            container.appendChild(emptyState);
            return;
        }

        emptyState.classList.add('hidden');
        
        container.innerHTML = filteredItems.map(item => {
            const statusClass = `status-${item.status.toLowerCase().replace(' ', '-')}`;
            const netProfit = item.netProfit || 0;
            const tagDisplay = item.tags && item.tags.length > 0 ? item.tags.join(', ') : '';

            return `
                <div class="item-card" data-id="${item.id}">
                    <div class="item-status ${statusClass}">${item.status.toUpperCase()}</div>
                    <div class="item-name">${item.name}</div>
                    ${item.size ? `<div class="item-details-text">SIZE: ${item.size}</div>` : ''}
                    ${tagDisplay ? `<div class="item-details-text">🏷️ ${tagDisplay}</div>` : ''}
                    ${item.hangerId ? `<div class="item-details-text">📍 ${item.hangerId}</div>` : ''}
                    ${item.costPrice || item.sellingPrice ? `
                        <div class="item-profit" style="color: ${netProfit >= 0 ? 'var(--retro-green)' : 'var(--retro-red)'}">
                            NET: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Add click listeners to cards
        container.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', () => {
                this.viewItem(card.dataset.id);
            });
        });
    }

    // Statistics Updates
    updateStats() {
        const totalItems = this.items.length;
        const activeCount = this.items.filter(i => i.status === 'Active').length;
        const inactiveCount = this.items.filter(i => i.status === 'Inactive').length;
        const soldCount = this.items.filter(i => i.status === 'SOLD').length;
        
        // Calculate total net profit from sold items
        const totalProfit = this.items
            .filter(i => i.status === 'SOLD')
            .reduce((sum, item) => sum + (item.netProfit || 0), 0);
        
        // Calculate total potential value (selling price of active items)
        const totalValue = this.items
            .filter(i => i.status === 'Active')
            .reduce((sum, item) => sum + (item.sellingPrice || 0), 0);
        
        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('totalValue').textContent = totalValue.toFixed(0);
        document.getElementById('availableCount').textContent = activeCount;
        document.getElementById('listedCount').textContent = inactiveCount;
        document.getElementById('soldCount').textContent = soldCount;
        document.getElementById('profitValue').textContent = totalProfit >= 0 ? `$${totalProfit.toFixed(0)}` : `-$${Math.abs(totalProfit).toFixed(0)}`;
    }

    // Level Bar (progress based on items added)
    updateLevelBar() {
        const totalItems = this.items.length;
        const maxLevel = 100;
        const percentage = Math.min((totalItems / maxLevel) * 100, 100);
        document.getElementById('levelFill').style.width = `${percentage}%`;
    }

    // Optional: Play retro sound effect
    playSuccessSound() {
        const powerBtn = document.getElementById('addBtn');
        powerBtn.style.transform = 'scale(1.2)';
        setTimeout(() => {
            powerBtn.style.transform = 'scale(1)';
        }, 200);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ResellerCloset();
});
