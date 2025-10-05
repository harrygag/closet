// Sort Service - Sorting functionality for items
class SortService {
  static sortItems(items, sortBy, sortOrder = 'asc') {
    const sorted = [...items]; // Don't mutate original

    switch (sortBy) {
      case 'date':
        sorted.sort((a, b) => {
          const dateA = new Date(a.dateAdded || 0);
          const dateB = new Date(b.dateAdded || 0);
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
        break;

      case 'profit':
        sorted.sort((a, b) => {
          const profitA = a.netProfit || 0;
          const profitB = b.netProfit || 0;
          return sortOrder === 'asc' ? profitA - profitB : profitB - profitA;
        });
        break;

      case 'name':
        sorted.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          if (sortOrder === 'asc') {
            return nameA.localeCompare(nameB);
          } else {
            return nameB.localeCompare(nameA);
          }
        });
        break;

      case 'price':
        sorted.sort((a, b) => {
          const priceA = a.sellingPrice || 0;
          const priceB = b.sellingPrice || 0;
          return sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
        });
        break;

      default:
        // No sorting, return as-is
        break;
    }

    return sorted;
  }

  static filterByPriceRange(items, minPrice, maxPrice) {
    return items.filter(item => {
      const price = item.sellingPrice || 0;
      return price >= minPrice && price <= maxPrice;
    });
  }

  static filterByDateRange(items, startDate, endDate) {
    return items.filter(item => {
      const itemDate = new Date(item.dateAdded);
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      return itemDate >= start && itemDate <= end;
    });
  }
}
