// Global state
let items = [];
let filters = {
    search: '',
    category: 'All',
    status: 'All',
    size: 'All'
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    setupSearchAndFilters();
    updateStats();
    startAutoRefresh();
});

// Setup search and filter functionality
function setupSearchAndFilters() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filters.search = e.target.value.toLowerCase();
            filterItems();
        });
    }

    // Category filter
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            filters.category = e.target.value;
            filterItems();
        });
    }

    // Status filter
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            filters.status = e.target.value;
            filterItems();
        });
    }

    // Size filter
    const sizeFilter = document.getElementById('sizeFilter');
    if (sizeFilter) {
        sizeFilter.addEventListener('change', (e) => {
            filters.size = e.target.value;
            filterItems();
        });
    }
}

// Filter items based on current filters
function filterItems() {
    const filteredItems = items.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(filters.search) ||
                            (item.brand && item.brand.toLowerCase().includes(filters.search));
        const matchesCategory = filters.category === 'All' || item.category === filters.category;
        const matchesStatus = filters.status === 'All' || item.status === filters.status;
        const matchesSize = filters.size === 'All' || item.size === filters.size;

        return matchesSearch && matchesCategory && matchesStatus && matchesSize;
    });

    displayItems(filteredItems);
    updateStats(filteredItems);
}

// Display items in the grid
function displayItems(itemsToDisplay) {
    const grid = document.querySelector('.item-grid');
    if (!grid) return;

    grid.innerHTML = itemsToDisplay.map(item => `
        <div class="item-card">
            <h3 style="color: ${getStatusColor(item.status)};">
                ${escapeHtml(item.title)}
            </h3>
            <p style="color: #ff00ff;">Brand: ${escapeHtml(item.brand || 'N/A')}</p>
            <p style="color: #00ffff;">Size: ${escapeHtml(item.size)}</p>
            <p style="color: #ffff00;">Category: ${escapeHtml(item.category)}</p>
            <p style="color: ${getStatusColor(item.status)};">Status: ${escapeHtml(item.status)}</p>
            <p style="color: #ff8000;">Hanger ID: ${escapeHtml(item.hangerID)}</p>
            ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" class="pixel-btn">View on eBay</a>` : ''}
            ${item.status === 'SOLD' ? `
                <div class="item-stats">
                    <p style="color: #00ffff;">Sale Price: $${item.salePrice.toFixed(2)}</p>
                    <p style="color: #ff0080;">eBay Fees: $${item.ebayFees.toFixed(2)}</p>
                    <p style="color: #00ff00;">Net Profit: $${item.netProfit.toFixed(2)}</p>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// Update statistics
function updateStats(filteredItems = items) {
    const statsContainer = document.getElementById('statsContainer');
    if (!statsContainer) return;

    const totalItems = filteredItems.length;
    const activeItems = filteredItems.filter(item => item.status === 'Active').length;
    const soldItems = filteredItems.filter(item => item.status === 'SOLD').length;
    const totalProfit = filteredItems
        .filter(item => item.status === 'SOLD')
        .reduce((sum, item) => sum + (item.netProfit || 0), 0);

    statsContainer.innerHTML = `
        <div class="stat-box">
            <span class="stat-label">TOTAL ITEMS</span>
            <span class="stat-value">${totalItems}</span>
        </div>
        <div class="stat-box">
            <span class="stat-label">ACTIVE</span>
            <span class="stat-value">${activeItems}</span>
        </div>
        <div class="stat-box">
            <span class="stat-label">SOLD</span>
            <span class="stat-value">${soldItems}</span>
        </div>
        <div class="stat-box">
            <span class="stat-label">TOTAL PROFIT</span>
            <span class="stat-value">$${totalProfit.toFixed(2)}</span>
        </div>
    `;
}

// Helper function to get status color
function getStatusColor(status) {
    switch (status) {
        case 'Active': return '#00ff00';
        case 'SOLD': return '#00ffff';
        default: return '#808080';
    }
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Auto-refresh every 5 minutes
function startAutoRefresh() {
    setInterval(() => {
        window.location.reload();
    }, 5 * 60 * 1000);
}

// Initialize filter options based on available items
function initializeFilterOptions() {
    const categories = [...new Set(items.map(item => item.category))];
    const sizes = [...new Set(items.map(item => item.size))];

    const categoryFilter = document.getElementById('categoryFilter');
    const sizeFilter = document.getElementById('sizeFilter');

    if (categoryFilter) {
        categoryFilter.innerHTML = `
            <option value="All">ALL CATEGORIES</option>
            ${categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('')}
        `;
    }

    if (sizeFilter) {
        sizeFilter.innerHTML = `
            <option value="All">ALL SIZES</option>
            ${sizes.map(size => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`).join('')}
        `;
    }
}
