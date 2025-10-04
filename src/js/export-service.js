// Export Service - Export data to JSON/CSV
class ExportService {
  static exportToJSON(items) {
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      itemCount: items.length,
      items: items
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `closet-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    return { success: true, count: items.length };
  }

  static exportToCSV(items) {
    if (items.length === 0) {
      return { success: false, error: 'No items to export' };
    }

    // CSV headers
    const headers = ['Name', 'Size', 'Status', 'Tags', 'Hanger ID', 'Hanger Status',
                     'Cost Price', 'Selling Price', 'eBay Fees', 'Net Profit',
                     'eBay URL', 'Date', 'Notes', 'Date Added'];

    // Convert items to CSV rows
    const rows = items.map(item => [
      `"${(item.name || '').replace(/"/g, '""')}"`,
      item.size || '',
      item.status || '',
      `"${(item.tags || []).join(', ')}"`,
      item.hangerId || '',
      item.hangerStatus || '',
      item.costPrice || 0,
      item.sellingPrice || 0,
      item.ebayFees || 0,
      item.netProfit || 0,
      item.ebayUrl || '',
      item.dateField || '',
      `"${(item.notes || '').replace(/"/g, '""')}"`,
      item.dateAdded || ''
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `closet-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    return { success: true, count: items.length };
  }
}
