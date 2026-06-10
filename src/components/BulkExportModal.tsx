import { useState } from 'react';
import { X, Download, FileText, Barcode, Tag, FileSpreadsheet, Printer, Eye } from 'lucide-react';
import { Button } from './ui/Button';
import type { Item } from '../types/item';

interface BulkExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
}

type ExportType = 'csv' | 'barcode' | 'packing' | 'poshmark' | 'mercari';

export const BulkExportModal: React.FC<BulkExportModalProps> = ({
  isOpen,
  onClose,
  items
}) => {
  const [selectedExport, setSelectedExport] = useState<ExportType | null>(null);
  const [previewData, setPreviewData] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // === CSV EXPORT FUNCTIONS ===

  const escapeCsvField = (field: any): string => {
    if (field === null || field === undefined) return '';
    const str = String(field);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const generateCSV = (items: Item[]): string => {
    // CSV Headers - comprehensive item data
    const headers = [
      'ID',
      'Name',
      'Size',
      'Status',
      'Hanger ID',
      'Tags',
      'Cost Price',
      'Selling Price',
      'eBay Fees',
      'Net Profit',
      'Date Added',
      'eBay Listing ID',
      'eBay SKU',
      'eBay URL',
      'eBay Title',
      'eBay Condition',
      'eBay Quantity',
      'eBay Category',
      'Brand',
      'UPC',
      'Primary Image',
      'All Images',
      'Shipping Type',
      'Shipping Cost',
      'Returns Accepted',
      'Item Location',
      'Notes'
    ];

    const rows = items.map(item => [
      item.id,
      item.name,
      item.size,
      item.status,
      item.hangerId,
      item.tags.join('; '),
      item.costPrice?.toFixed(2) || '0.00',
      item.sellingPrice?.toFixed(2) || '0.00',
      item.ebayFees?.toFixed(2) || '0.00',
      item.netProfit?.toFixed(2) || '0.00',
      item.dateAdded,
      item.ebayListingId || '',
      item.ebaySku || '',
      item.ebayUrl || '',
      item.ebayFullTitle || item.name,
      item.ebayCondition || '',
      item.ebayQuantity || '',
      item.ebayCategoryName || '',
      item.ebayBrand || item.ebayItemSpecifics?.Brand || '',
      item.ebayUPC || '',
      item.ebayPrimaryImage || item.imageUrl || '',
      item.ebayAllImages?.join('; ') || '',
      item.ebayShippingInfo?.shippingType || '',
      item.ebayShippingInfo?.services?.[0]?.cost ? (item.ebayShippingInfo.services[0].cost / 100).toFixed(2) : '',
      item.ebayReturnPolicy?.returnsAccepted ? 'Yes' : 'No',
      [
        item.ebayItemLocation?.city,
        item.ebayItemLocation?.state,
        item.ebayItemLocation?.postalCode
      ].filter(Boolean).join(', '),
      item.notes
    ]);

    // Build CSV content
    const csvContent = [
      headers.map(escapeCsvField).join(','),
      ...rows.map(row => row.map(escapeCsvField).join(','))
    ].join('\n');

    return csvContent;
  };

  const generatePoshmarkCSV = (items: Item[]): string => {
    // Poshmark CSV format
    const headers = [
      'Title',
      'Description',
      'Category',
      'Brand',
      'Size',
      'Color',
      'Price',
      'Original Price',
      'Photos',
      'Condition'
    ];

    const rows = items.map(item => [
      item.ebayFullTitle || item.name,
      item.ebayFullDescription?.replace(/<[^>]*>/g, '') || item.notes, // Strip HTML
      item.ebayCategoryName || '',
      item.ebayBrand || item.ebayItemSpecifics?.Brand || '',
      item.size,
      item.ebayItemSpecifics?.Color || '',
      item.sellingPrice?.toFixed(2) || '0.00',
      item.costPrice?.toFixed(2) || '0.00',
      item.ebayAllImages?.join('; ') || '',
      item.ebayCondition || 'Good'
    ]);

    return [
      headers.map(escapeCsvField).join(','),
      ...rows.map(row => row.map(escapeCsvField).join(','))
    ].join('\n');
  };

  const generateMercariCSV = (items: Item[]): string => {
    // Mercari CSV format
    const headers = [
      'Product Name',
      'Description',
      'Brand',
      'Size',
      'Condition',
      'Price',
      'Shipping',
      'Category',
      'Image URLs'
    ];

    const rows = items.map(item => [
      item.ebayFullTitle || item.name,
      item.ebayFullDescription?.replace(/<[^>]*>/g, '') || item.notes,
      item.ebayBrand || item.ebayItemSpecifics?.Brand || '',
      item.size,
      item.ebayCondition || 'Good',
      item.sellingPrice?.toFixed(2) || '0.00',
      item.ebayShippingInfo?.freeShipping ? 'Free' : 'Paid',
      item.ebayCategoryName || '',
      item.ebayAllImages?.join('; ') || ''
    ]);

    return [
      headers.map(escapeCsvField).join(','),
      ...rows.map(row => row.map(escapeCsvField).join(','))
    ].join('\n');
  };

  // === PDF GENERATION FUNCTIONS ===

  const generateBarcodePDF = (items: Item[]): string => {
    // Generate printable barcode labels as HTML (can be printed to PDF)
    const labelWidth = '4in';
    const labelHeight = '2in';

    const labelsHTML = items.map((item) => {
      const barcode = item.barcode || item.ebaySku || item.id;
      const price = item.sellingPrice?.toFixed(2) || '0.00';

      return `
        <div class="label" style="
          width: ${labelWidth};
          height: ${labelHeight};
          border: 1px dashed #ccc;
          padding: 12px;
          box-sizing: border-box;
          page-break-inside: avoid;
          display: inline-block;
          margin: 4px;
          font-family: Arial, sans-serif;
        ">
          <div style="font-size: 11px; font-weight: bold; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${item.name}
          </div>
          <div style="text-align: center; margin: 8px 0;">
            <svg width="200" height="60">
              <!-- Simple barcode representation -->
              <rect x="10" y="5" width="2" height="50" fill="#000"/>
              <rect x="15" y="5" width="3" height="50" fill="#000"/>
              <rect x="21" y="5" width="2" height="50" fill="#000"/>
              <rect x="26" y="5" width="4" height="50" fill="#000"/>
              <rect x="33" y="5" width="2" height="50" fill="#000"/>
              <rect x="38" y="5" width="3" height="50" fill="#000"/>
              <rect x="44" y="5" width="2" height="50" fill="#000"/>
              <rect x="49" y="5" width="5" height="50" fill="#000"/>
              <rect x="57" y="5" width="2" height="50" fill="#000"/>
              <rect x="62" y="5" width="3" height="50" fill="#000"/>
              <rect x="68" y="5" width="2" height="50" fill="#000"/>
              <rect x="73" y="5" width="4" height="50" fill="#000"/>
              <text x="100" y="45" font-size="10" text-anchor="middle">${barcode}</text>
            </svg>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 4px;">
            <span>SKU: ${item.ebaySku || item.id.slice(0, 8)}</span>
            <span style="font-weight: bold; font-size: 14px;">$${price}</span>
          </div>
          <div style="font-size: 9px; color: #666; margin-top: 4px;">
            Size: ${item.size} | ${item.ebayCondition || 'Good'}
          </div>
        </div>
      `;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Barcode Labels - ${new Date().toLocaleDateString()}</title>
  <style>
    @page {
      size: letter;
      margin: 0.25in;
    }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 10px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #333;
    }
    .labels-container {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
  </style>
</head>
<body>
  <div class="header no-print">
    <h1>Barcode Labels</h1>
    <p>${items.length} items - Generated ${new Date().toLocaleString()}</p>
    <button onclick="window.print()" style="padding: 8px 16px; font-size: 14px; cursor: pointer;">Print Labels</button>
  </div>
  <div class="labels-container">
    ${labelsHTML}
  </div>
</body>
</html>
    `;
  };

  const generatePackingSlipPDF = (items: Item[]): string => {
    const itemRows = items.map((item, index) => `
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 12px; text-align: center;">${index + 1}</td>
        <td style="padding: 12px;">
          <strong>${item.name}</strong><br/>
          <small style="color: #666;">SKU: ${item.ebaySku || item.id.slice(0, 8)}</small>
        </td>
        <td style="padding: 12px; text-align: center;">${item.size}</td>
        <td style="padding: 12px; text-align: center;">${item.ebayCondition || 'Good'}</td>
        <td style="padding: 12px; text-align: right; font-weight: bold;">$${item.sellingPrice?.toFixed(2) || '0.00'}</td>
        <td style="padding: 12px; text-align: center;">
          <input type="checkbox" style="width: 20px; height: 20px;">
        </td>
      </tr>
    `).join('');

    const totalValue = items.reduce((sum, item) => sum + (item.sellingPrice || 0), 0);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Packing Slip - ${new Date().toLocaleDateString()}</title>
  <style>
    @page {
      size: letter;
      margin: 0.5in;
    }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      color: #333;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #333;
    }
    .company-info {
      flex: 1;
    }
    .slip-info {
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background-color: #333;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: bold;
    }
    .summary {
      margin-top: 30px;
      padding: 20px;
      background-color: #f5f5f5;
      border-radius: 8px;
    }
    .signature-line {
      margin-top: 50px;
      border-top: 2px solid #333;
      padding-top: 10px;
      width: 300px;
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; margin-bottom: 20px;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer; background: #333; color: white; border: none; border-radius: 4px;">
      Print Packing Slip
    </button>
  </div>

  <div class="header">
    <div class="company-info">
      <h1 style="margin: 0 0 10px 0;">PACKING SLIP</h1>
      <p style="margin: 0; color: #666;">Your Closet Inventory</p>
    </div>
    <div class="slip-info">
      <p style="margin: 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      <p style="margin: 5px 0 0 0;"><strong>Items:</strong> ${items.length}</p>
      <p style="margin: 5px 0 0 0;"><strong>Slip #:</strong> ${Date.now().toString().slice(-8)}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align: center; width: 50px;">#</th>
        <th>Item Description</th>
        <th style="text-align: center; width: 80px;">Size</th>
        <th style="text-align: center; width: 100px;">Condition</th>
        <th style="text-align: right; width: 100px;">Price</th>
        <th style="text-align: center; width: 80px;">Packed</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="summary">
    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
      <strong>Total Items:</strong>
      <span>${items.length}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 18px;">
      <strong>Total Value:</strong>
      <strong>$${totalValue.toFixed(2)}</strong>
    </div>
  </div>

  <div class="signature-line">
    <p style="margin: 0; font-size: 12px; color: #666;">Packed By:</p>
    <p style="margin: 30px 0 0 0; font-size: 12px; color: #666;">Date:</p>
  </div>

  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #999; text-align: center;">
    Generated by Closet Management System - ${new Date().toLocaleString()}
  </div>
</body>
</html>
    `;
  };

  // === EXPORT HANDLERS ===

  const handlePreview = (type: ExportType) => {
    setSelectedExport(type);

    let preview = '';
    switch (type) {
      case 'csv':
        preview = generateCSV(items);
        break;
      case 'poshmark':
        preview = generatePoshmarkCSV(items);
        break;
      case 'mercari':
        preview = generateMercariCSV(items);
        break;
      case 'barcode':
        preview = 'Barcode labels will be generated as a printable PDF.\n\n';
        preview += `${items.length} labels will be created in 2x4" format.\n`;
        preview += 'Each label includes:\n- Item name\n- Barcode (SKU)\n- Price\n- Size and condition';
        break;
      case 'packing':
        preview = 'Packing slip will be generated as a printable document.\n\n';
        preview += `${items.length} items will be listed.\n`;
        preview += 'Includes checkboxes for tracking packed items.';
        break;
    }

    setPreviewData(preview);
  };

  const handleDownload = (type: ExportType) => {
    setIsProcessing(true);

    try {
      let content = '';
      let filename = '';
      let mimeType = '';

      switch (type) {
        case 'csv':
          content = generateCSV(items);
          filename = `closet-export-${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = 'text/csv;charset=utf-8;';
          break;

        case 'poshmark':
          content = generatePoshmarkCSV(items);
          filename = `poshmark-export-${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = 'text/csv;charset=utf-8;';
          break;

        case 'mercari':
          content = generateMercariCSV(items);
          filename = `mercari-export-${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = 'text/csv;charset=utf-8;';
          break;

        case 'barcode':
          content = generateBarcodePDF(items);
          filename = `barcode-labels-${new Date().toISOString().split('T')[0]}.html`;
          mimeType = 'text/html;charset=utf-8;';
          // Open in new window for printing
          const barcodeWindow = window.open('', '_blank');
          if (barcodeWindow) {
            barcodeWindow.document.write(content);
            barcodeWindow.document.close();
          }
          setIsProcessing(false);
          return;

        case 'packing':
          content = generatePackingSlipPDF(items);
          filename = `packing-slip-${new Date().toISOString().split('T')[0]}.html`;
          mimeType = 'text/html;charset=utf-8;';
          // Open in new window for printing
          const packingWindow = window.open('', '_blank');
          if (packingWindow) {
            packingWindow.document.write(content);
            packingWindow.document.close();
          }
          setIsProcessing(false);
          return;
      }

      // Create download link
      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gradient-to-r from-purple-900/50 to-blue-900/50">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Download className="h-6 w-6" />
              Bulk Export
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {items.length} items selected for export
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Export Options Grid */}
        <div className="p-6 border-b border-gray-700 bg-gray-800/30">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">SELECT EXPORT TYPE</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* CSV Export */}
            <div
              className={`bg-gray-800 rounded-lg p-5 border-2 transition-all cursor-pointer hover:bg-gray-750 ${
                selectedExport === 'csv' ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'
              }`}
              onClick={() => handlePreview('csv')}
            >
              <FileSpreadsheet className="h-8 w-8 text-green-400 mb-3" />
              <h4 className="text-white font-semibold mb-1">CSV Export</h4>
              <p className="text-xs text-gray-400 mb-3">
                Complete item data including eBay details, pricing, images, and shipping info
              </p>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload('csv');
                }}
                size="sm"
                disabled={isProcessing}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className="h-4 w-4 mr-1" />
                Download CSV
              </Button>
            </div>

            {/* Barcode Labels */}
            <div
              className={`bg-gray-800 rounded-lg p-5 border-2 transition-all cursor-pointer hover:bg-gray-750 ${
                selectedExport === 'barcode' ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'
              }`}
              onClick={() => handlePreview('barcode')}
            >
              <Barcode className="h-8 w-8 text-purple-400 mb-3" />
              <h4 className="text-white font-semibold mb-1">Barcode Labels</h4>
              <p className="text-xs text-gray-400 mb-3">
                Printable 2x4" labels with barcodes, SKU, price, and item details
              </p>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload('barcode');
                }}
                size="sm"
                disabled={isProcessing}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Printer className="h-4 w-4 mr-1" />
                Print Labels
              </Button>
            </div>

            {/* Packing Slips */}
            <div
              className={`bg-gray-800 rounded-lg p-5 border-2 transition-all cursor-pointer hover:bg-gray-750 ${
                selectedExport === 'packing' ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'
              }`}
              onClick={() => handlePreview('packing')}
            >
              <FileText className="h-8 w-8 text-blue-400 mb-3" />
              <h4 className="text-white font-semibold mb-1">Packing Slip</h4>
              <p className="text-xs text-gray-400 mb-3">
                Professional packing slip with checkboxes for shipment verification
              </p>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload('packing');
                }}
                size="sm"
                disabled={isProcessing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Printer className="h-4 w-4 mr-1" />
                Print Slip
              </Button>
            </div>

            {/* Poshmark Export */}
            <div
              className={`bg-gray-800 rounded-lg p-5 border-2 transition-all cursor-pointer hover:bg-gray-750 ${
                selectedExport === 'poshmark' ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'
              }`}
              onClick={() => handlePreview('poshmark')}
            >
              <Tag className="h-8 w-8 text-pink-400 mb-3" />
              <h4 className="text-white font-semibold mb-1">Poshmark CSV</h4>
              <p className="text-xs text-gray-400 mb-3">
                Formatted for Poshmark bulk upload with title, brand, size, and photos
              </p>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload('poshmark');
                }}
                size="sm"
                disabled={isProcessing}
                className="w-full bg-pink-600 hover:bg-pink-700 text-white"
              >
                <Download className="h-4 w-4 mr-1" />
                Download CSV
              </Button>
            </div>

            {/* Mercari Export */}
            <div
              className={`bg-gray-800 rounded-lg p-5 border-2 transition-all cursor-pointer hover:bg-gray-750 ${
                selectedExport === 'mercari' ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'
              }`}
              onClick={() => handlePreview('mercari')}
            >
              <Tag className="h-8 w-8 text-orange-400 mb-3" />
              <h4 className="text-white font-semibold mb-1">Mercari CSV</h4>
              <p className="text-xs text-gray-400 mb-3">
                Formatted for Mercari with product details, condition, and shipping info
              </p>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload('mercari');
                }}
                size="sm"
                disabled={isProcessing}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Download className="h-4 w-4 mr-1" />
                Download CSV
              </Button>
            </div>

          </div>
        </div>

        {/* Preview Panel */}
        {selectedExport && (
          <div className="flex-1 overflow-hidden flex flex-col bg-gray-800/50">
            <div className="px-6 py-3 border-b border-gray-700 flex items-center gap-2">
              <Eye className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-300">Preview</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap bg-gray-900 rounded-lg p-4 border border-gray-700">
                {previewData || 'Click an export type to preview...'}
              </pre>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400">
              {selectedExport ? (
                <span>Selected: <span className="text-white font-semibold capitalize">{selectedExport}</span> export</span>
              ) : (
                <span>Select an export type above</span>
              )}
            </div>
            <Button
              onClick={onClose}
              disabled={isProcessing}
              className="bg-gray-700 hover:bg-gray-600 text-white"
            >
              Close
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};
