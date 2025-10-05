// UI Service - DOM Manipulation and Rendering
class UIService {
    constructor() {
        this.currentEditId = null;
    }

    // Stats Updates
    updateStats(items) {
        const totalItems = items.length;
        const activeCount = items.filter(i => i.status === 'Active').length;
        const inactiveCount = items.filter(i => i.status === 'Inactive').length;
        const soldCount = items.filter(i => i.status === 'SOLD').length;

        const totalProfit = items
            .filter(i => i.status === 'SOLD')
            .reduce((sum, item) => sum + (item.netProfit || 0), 0);

        const totalValue = items
            .filter(i => i.status === 'Active')
            .reduce((sum, item) => sum + (item.sellingPrice || 0), 0);

        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('totalValue').textContent = totalValue.toFixed(0);
        document.getElementById('availableCount').textContent = activeCount;
        document.getElementById('listedCount').textContent = inactiveCount;
        document.getElementById('soldCount').textContent = soldCount;
        document.getElementById('profitValue').textContent = totalProfit >= 0 ? `$${totalProfit.toFixed(0)}` : `-$${Math.abs(totalProfit).toFixed(0)}`;
    }

    // Level Bar
    updateLevelBar(items) {
        const totalItems = items.length;
        const maxLevel = 100;
        const percentage = Math.min((totalItems / maxLevel) * 100, 100);
        document.getElementById('levelFill').style.width = `${percentage}%`;
    }

    // Render Items Grid
    renderItems(filteredItems, onItemClick, bulkService = null) {
        const container = document.getElementById('itemsGrid');
        const emptyState = document.getElementById('emptyState');

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
            const isSelected = bulkService && bulkService.isSelected(item.id);

            return `
                <div class="item-card ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                    ${bulkService ? `<input type="checkbox" class="item-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">` : ''}
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

        // Add click listeners
        container.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('item-checkbox')) {
                    onItemClick(card.dataset.id);
                }
            });
        });
    }

    // Modal Management
    openModal(itemData = null) {
        const modal = document.getElementById('itemModal');
        const form = document.getElementById('itemForm');
        const title = document.getElementById('modalTitle');

        if (itemData) {
            // Edit mode
            title.textContent = 'EDIT ITEM';
            this.populateForm(itemData);
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

    populateForm(item) {
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

    getFormData() {
        const itemId = document.getElementById('itemId').value;
        const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
        const listPrice = parseFloat(document.getElementById('listPrice').value) || 0;
        const sellingPrice = parseFloat(document.getElementById('sellingPrice').value) || 0;
        const ebayFees = parseFloat(document.getElementById('ebayFees').value) || 0;

        // Get selected tags
        const selectedTags = [];
        document.querySelectorAll('input[name="tags"]:checked').forEach(checkbox => {
            selectedTags.push(checkbox.value);
        });

        return {
            id: itemId,
            name: document.getElementById('itemName').value,
            size: document.getElementById('size').value,
            status: document.getElementById('status').value,
            hangerStatus: document.getElementById('hangerStatus').value,
            hangerId: document.getElementById('hangerId').value,
            tags: selectedTags,
            ebayUrl: document.getElementById('ebayUrl').value,
            costPrice: costPrice,
            listPrice: listPrice,
            sellingPrice: sellingPrice,
            ebayFees: ebayFees,
            netProfit: sellingPrice - costPrice - ebayFees,
            dateField: document.getElementById('dateField').value,
            notes: document.getElementById('notes').value
        };
    }

    // View Item Details
    renderItemDetails(item) {
        this.currentEditId = item.id;

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

    // Success Animation
    playSuccessAnimation() {
        const powerBtn = document.getElementById('addBtn');
        powerBtn.style.transform = 'scale(1.2)';
        setTimeout(() => {
            powerBtn.style.transform = 'scale(1)';
        }, 200);
    }

    // Net Profit Calculator Display
    updateNetProfitDisplay(cost, selling, fees) {
        const netProfit = parseFloat(selling || 0) - parseFloat(cost || 0) - parseFloat(fees || 0);
        const display = document.getElementById('netProfitDisplay');

        display.value = netProfit > 0 ? `+$${netProfit.toFixed(2)}` : netProfit < 0 ? `-$${Math.abs(netProfit).toFixed(2)}` : '$0.00';
        display.style.color = netProfit > 0 ? 'var(--retro-green)' : netProfit < 0 ? 'var(--retro-red)' : 'var(--retro-cyan)';
    }
}
