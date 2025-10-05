// Closet View Service - Visual hanging clothes interface
class ClosetViewService {
    constructor(itemService) {
        this.itemService = itemService;
        this.currentView = 'cards'; // 'cards' or 'closet'
    }

    // Group items by type and sort by hanger ID
    groupItemsByType(items) {
        console.log(`🗂️ Grouping ${items.length} items by type...`);
        const groups = {};

        items.forEach(item => {
            const type = item.type || 'Other';
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(item);
        });

        // Sort each group by hanger ID
        Object.keys(groups).forEach(type => {
            groups[type].sort((a, b) => {
                const hangerA = a.hangerId || '';
                const hangerB = b.hangerId || '';
                return hangerA.localeCompare(hangerB, undefined, { numeric: true });
            });
        });

        console.log(`✅ Grouped into ${Object.keys(groups).length} types:`, Object.keys(groups));
        return groups;
    }

    // Get clothing emoji based on type
    getClothingEmoji(type) {
        const emojiMap = {
            'Shirts': '👕',
            'T-shirts': '👕',
            'Pants': '👖',
            'Bottoms': '👖',
            'Shoes': '👟',
            'Dress': '👗',
            'Jacket': '🧥',
            'Pullover/Jackets': '🧥',
            'Hoodie': '🧥',
            'Jersey': '👕',
            'polo': '👔',
            'Accessories': '👜',
            'Hat': '🎩',
            'Bag': '👜'
        };

        return emojiMap[type] || '👕'; // Default to shirt
    }

    // Get status class
    getStatusClass(status) {
        if (status === 'Active') return 'active';
        if (status === 'Inactive') return 'inactive';
        if (status === 'SOLD') return 'sold';
        return 'active';
    }

    // Render a single hanger item
    renderHangerItem(item) {
        const emoji = this.getClothingEmoji(item.type);
        const statusClass = this.getStatusClass(item.status);
        const price = parseFloat(item.sellingPrice) || 0;

        return `
            <div class="hanger-item"
                 data-item-id="${item.id}"
                 draggable="true"
                 data-hanger-id="${item.hangerId || ''}"
                 data-type="${item.type || ''}">

                <!-- Status indicator -->
                <div class="status-indicator ${statusClass}"></div>

                <!-- Hanger structure -->
                <div class="hanger">
                    <div class="hanger-hook"></div>
                    <div class="hanger-wire"></div>
                </div>

                <!-- Clothing icon -->
                <div class="clothing-icon" data-type="${item.type || ''}">${emoji}</div>

                <!-- Hanger ID -->
                <div class="hanger-id">${item.hangerId || 'N/A'}</div>

                <!-- Price tag -->
                <div class="price-tag">$${price.toFixed(0)}</div>
            </div>
        `;
    }

    // Render closet section (one type group)
    renderClosetSection(type, items) {
        const itemsHtml = items.map(item => this.renderHangerItem(item)).join('');

        return `
            <div class="closet-section" data-section-type="${type}">
                <div class="closet-section-header">━━━━ ${type.toUpperCase()} ━━━━</div>
                <div class="closet-rod"></div>
                <div class="closet-items-row">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    // Render entire closet view
    renderClosetView(items) {
        if (!items || items.length === 0) {
            return `
                <div class="closet-container">
                    <div class="empty-closet">
                        <div>👔</div>
                        <div>NO ITEMS IN CLOSET</div>
                        <div style="margin-top: 10px; font-size: 10px;">ADD ITEMS TO SEE THEM HERE</div>
                    </div>
                </div>
            `;
        }

        const groups = this.groupItemsByType(items);
        const sectionsHtml = Object.keys(groups)
            .sort() // Alphabetical type order
            .map(type => this.renderClosetSection(type, groups[type]))
            .join('');

        return `
            <div class="closet-container">
                ${sectionsHtml}
            </div>
        `;
    }

    // Toggle between views
    toggleView() {
        this.currentView = this.currentView === 'cards' ? 'closet' : 'cards';
        return this.currentView;
    }

    // Setup drag-and-drop event listeners
    setupDragAndDrop(containerElement) {
        let draggedItem = null;

        // Drag start
        containerElement.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('hanger-item')) {
                draggedItem = e.target;
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', e.target.innerHTML);
            }
        });

        // Drag over
        containerElement.addEventListener('dragover', (e) => {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';

            const target = e.target.closest('.hanger-item');
            if (target && target !== draggedItem) {
                target.classList.add('drag-over');
            }

            return false;
        });

        // Drag enter
        containerElement.addEventListener('dragenter', (e) => {
            const target = e.target.closest('.hanger-item');
            if (target && target !== draggedItem) {
                target.classList.add('drag-over');
            }
        });

        // Drag leave
        containerElement.addEventListener('dragleave', (e) => {
            const target = e.target.closest('.hanger-item');
            if (target) {
                target.classList.remove('drag-over');
            }
        });

        // Drop
        containerElement.addEventListener('drop', (e) => {
            if (e.stopPropagation) {
                e.stopPropagation();
            }

            const target = e.target.closest('.hanger-item');
            if (target && target !== draggedItem) {
                // Swap hanger IDs
                const draggedId = draggedItem.dataset.itemId;
                const targetId = target.dataset.itemId;
                const draggedHangerId = draggedItem.dataset.hangerId;
                const targetHangerId = target.dataset.hangerId;

                // Update items in itemService
                const draggedItemData = this.itemService.getItem(draggedId);
                const targetItemData = this.itemService.getItem(targetId);

                if (draggedItemData && targetItemData) {
                    // Swap hanger IDs
                    this.itemService.updateItem(draggedId, {
                        ...draggedItemData,
                        hangerId: targetHangerId
                    });

                    this.itemService.updateItem(targetId, {
                        ...targetItemData,
                        hangerId: draggedHangerId
                    });

                    // Show success notification
                    if (typeof UIService !== 'undefined' && UIService.showNotification) {
                        UIService.showNotification(
                            `Moved items: ${draggedHangerId} ↔️ ${targetHangerId}`,
                            'success'
                        );
                    }

                    // Re-render closet view through app
                    if (typeof window.app !== 'undefined') {
                        window.app.render();
                    }
                }

                target.classList.remove('drag-over');
            }

            return false;
        });

        // Drag end
        containerElement.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('hanger-item')) {
                e.target.classList.remove('dragging');

                // Remove all drag-over classes
                containerElement.querySelectorAll('.drag-over').forEach(el => {
                    el.classList.remove('drag-over');
                });
            }
        });

        // Click to edit
        containerElement.addEventListener('click', (e) => {
            const hangerItem = e.target.closest('.hanger-item');
            if (hangerItem && !e.target.closest('.dragging')) {
                const itemId = hangerItem.dataset.itemId;
                // Use the global app instance to open edit modal
                if (typeof window.app !== 'undefined') {
                    window.app.viewItem(itemId);
                }
            }
        });
    }

    // Refresh closet view
    refreshClosetView() {
        const itemsGrid = document.getElementById('itemsGrid');
        if (itemsGrid && this.currentView === 'closet') {
            const items = this.itemService.getAllItems();
            itemsGrid.innerHTML = this.renderClosetView(items);
            this.setupDragAndDrop(itemsGrid);
        }
    }

    // Initialize closet view
    init() {
        console.log('Closet View Service initialized');
    }
}
