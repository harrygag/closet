// Filter Service - Search and Filtering Logic
class FilterService {
    constructor() {
        this.currentStatusFilter = 'all';
        this.currentTagFilter = 'all';
        this.searchQuery = '';
    }

    setStatusFilter(status) {
        this.currentStatusFilter = status;
    }

    setTagFilter(tag) {
        this.currentTagFilter = tag;
    }

    setSearchQuery(query) {
        this.searchQuery = query.toLowerCase();
    }

    filterItems(items) {
        return items.filter(item => {
            const matchesStatus = this.matchesStatus(item);
            const matchesTag = this.matchesTag(item);
            const matchesSearch = this.matchesSearch(item);

            return matchesStatus && matchesTag && matchesSearch;
        });
    }

    matchesStatus(item) {
        return this.currentStatusFilter === 'all' || item.status === this.currentStatusFilter;
    }

    matchesTag(item) {
        return this.currentTagFilter === 'all' || (item.tags && item.tags.includes(this.currentTagFilter));
    }

    matchesSearch(item) {
        if (!this.searchQuery) return true;

        const searchableFields = [
            item.name,
            item.size,
            item.hangerId,
            ...(item.tags || [])
        ];

        return searchableFields.some(field =>
            field && field.toLowerCase().includes(this.searchQuery)
        );
    }

    getActiveFilters() {
        return {
            status: this.currentStatusFilter,
            tag: this.currentTagFilter,
            search: this.searchQuery
        };
    }

    resetFilters() {
        this.currentStatusFilter = 'all';
        this.currentTagFilter = 'all';
        this.searchQuery = '';
    }
}
