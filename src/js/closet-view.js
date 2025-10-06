// Closet View Service - Visual hanging clothes interface
class ClosetViewService {
    constructor(itemService) {
        this.itemService = itemService;
        this.currentView = 'cards'; // 'cards' or 'closet'
    }

    // Fixed 6 category racks
    getFixedCategories() {
        return [
            { name: 'Hoodie', icon: '🧥' },
            { name: 'Jersey', icon: '👕' },
            { name: 'Pullover/Jackets', icon: '🧥' },
            { name: 'polo', icon: '👔' },
            { name: 'T-shirts', icon: '👕' },
            { name: 'Bottoms', icon: '👖' }
        ];
    }

    // Group items into 6 fixed categories
    groupItemsByFixedCategories(items) {
        const categories = this.getFixedCategories();
        const groups = {};

        // Initialize all 6 categories
        categories.forEach(cat => {
            groups[cat.name] = [];
        });

        // Distribute items into categories
        items.forEach(item => {
            // Check if item has any of these tags
            const itemTags = item.tags || [];
            let placed = false;

            for (const cat of categories) {
                if (itemTags.includes(cat.name)) {
                    groups[cat.name].push(item);
                    placed = true;
                    break;
                }
            }

            // If no matching tag, try to match by type
            if (!placed && item.type) {
                for (const cat of categories) {
                    if (item.type === cat.name) {
                        groups[cat.name].push(item);
                        break;
                    }
                }
            }
        });

        // Sort each group by hanger ID
        Object.keys(groups).forEach(catName => {
            groups[catName].sort((a, b) => {
                const hangerA = a.hangerId || '';
                const hangerB = b.hangerId || '';
                return hangerA.localeCompare(hangerB, undefined, { numeric: true });
            });
        });

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

    // Get platform logo based on URL - Returns actual logo text/emoji
    getPlatformLogo(item) {
        const logos = [];
        
        // Check eBay URL
        if (item.ebayUrl && item.ebayUrl.toLowerCase().includes('ebay')) {
            logos.push('<span class="platform-logo ebay">eBay</span>');
        }
        
        // Check for Poshmark
        if (item.poshmarkUrl || (item.ebayUrl && item.ebayUrl.toLowerCase().includes('poshmark'))) {
            logos.push('<span class="platform-logo poshmark">Posh</span>');
        }
        
        // Check for Depop
        if (item.depopUrl || (item.ebayUrl && item.ebayUrl.toLowerCase().includes('depop'))) {
            logos.push('<span class="platform-logo depop">Depop</span>');
        }
        
        // Check for Mercari
        if (item.mercariUrl || (item.ebayUrl && item.ebayUrl.toLowerCase().includes('mercari'))) {
            logos.push('<span class="platform-logo mercari">Mercari</span>');
        }
        
        // Check for Grailed
        if (item.grailedUrl || (item.ebayUrl && item.ebayUrl.toLowerCase().includes('grailed'))) {
            logos.push('<span class="platform-logo grailed">Grailed</span>');
        }
        
        return logos.join(' ');
    }

    // Render a single hanger item (enhanced with photo, price, platform, hanger ID)
    async renderHangerItem(item) {
        const statusClass = this.getStatusClass(item.status);
        const price = parseFloat(item.sellingPrice) || parseFloat(item.listPrice) || 0;
        const platform = this.getPlatformLogo(item);
        
        // Get first photo if available
        let photoHtml = '';
        if (item.photoIds && item.photoIds.length > 0 && typeof PhotoStorageService !== 'undefined') {
            const photoUrl = await PhotoStorageService.getPhoto(item.photoIds[0]);
            if (photoUrl) {
                photoHtml = `<img src="${photoUrl}" alt="${item.name}" class="hanger-photo">`;
            }
        }

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

                <!-- Photo (if available) -->
                ${photoHtml ? `<div class="hanger-photo-container">${photoHtml}</div>` : ''}

                <!-- Hanger ID (prominent) -->
                <div class="hanger-id-large">${item.hangerId || 'N/A'}</div>

                <!-- Price -->
                <div class="hanger-price">$${price.toFixed(0)}</div>

                <!-- Platform Logo -->
                ${platform ? `<div class="hanger-platform">${platform}</div>` : ''}
            </div>
        `;
    }

    // Render closet section (one type group) - with async photo loading and rack number
    async renderClosetSection(type, items, icon, rackNumber) {
        // Sort items by hanger ID numerically
        const sortedItems = [...items].sort((a, b) => {
            const numA = parseInt(a.hangerId) || 0;
            const numB = parseInt(b.hangerId) || 0;
            return numA - numB;
        });

        const itemsPromises = sortedItems.map(item => this.renderHangerItem(item));
        const itemsHtml = (await Promise.all(itemsPromises)).join('');

        const itemCount = sortedItems.length;
        const countDisplay = itemCount > 0 ? `(${itemCount})` : '(0)';

        return `
            <div class="closet-section" data-section-type="${type}">
                <div class="closet-section-header">
                    <span class="rack-number">RACK ${rackNumber}</span> ${icon} ${type.toUpperCase()} ${countDisplay}
                </div>
                <div class="closet-rod"></div>
                <div class="closet-items-row">
                    ${itemsHtml || '<div class="empty-rack">No items</div>'}
                </div>
            </div>
        `;
    }

    // Render entire closet view with 6 fixed categories
    async renderClosetView(items) {
        console.log('🎨 renderClosetView called with', items?.length, 'items');
        
        if (!items || items.length === 0) {
            console.log('⚠️ No items, showing empty state');
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

        // Use fixed 6 categories
        const groups = this.groupItemsByFixedCategories(items);
        const categories = this.getFixedCategories();
        
        console.log('📊 Grouped items:', Object.keys(groups).map(k => `${k}: ${groups[k].length}`));
        
        // Render all 6 sections (even if empty) with rack numbers 1-6
        const sectionsPromises = categories.map((cat, index) => {
            const rackNumber = index + 1; // RACK 1, 2, 3, 4, 5, 6
            console.log(`🔨 Rendering section: ${cat.name} with ${groups[cat.name]?.length || 0} items`);
            return this.renderClosetSection(cat.name, groups[cat.name] || [], cat.icon, rackNumber);
        });
        const sectionsHtml = (await Promise.all(sectionsPromises)).join('\n');

        console.log('✅ All 6 sections rendered, total HTML length:', sectionsHtml.length);
        
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
