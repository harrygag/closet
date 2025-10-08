import type { Item } from '../types/item';

export const exportToCSV = (items: Item[], filename?: string) => {
  const headers = [
    'Name',
    'Category', 
    'Size',
    'Status',
    'Cost Price',
    'Selling Price',
    'Profit',
    'Margin %',
    'Days Listed',
    'eBay URL',
    'Mercari URL', 
    'Poshmark URL',
    'Notes',
    'Date Added'
  ];

  const rows = items.map(item => {
    const profit = item.sellingPrice - item.costPrice;
    const margin = item.costPrice > 0 ? Math.round((profit / item.costPrice) * 100) : 0;
    const daysListed = item.dateAdded ? 
      Math.floor((new Date().getTime() - new Date(item.dateAdded).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    const mercariUrl = item.marketplaceUrls?.find(m => m.type === 'mercari')?.url || '';
    const poshmarkUrl = item.marketplaceUrls?.find(m => m.type === 'poshmark')?.url || '';

    return [
      item.name,
      item.tags.join(', '),
      item.size,
      item.status,
      item.costPrice,
      item.sellingPrice,
      profit,
      margin,
      daysListed,
      item.ebayUrl || '',
      mercariUrl,
      poshmarkUrl,
      item.notes,
      item.dateAdded
    ];
  });

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename || `inventory-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

