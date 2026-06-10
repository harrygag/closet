import { useState } from 'react';
import { collection, addDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth } from '../lib/firebase/client';

export function ImportPage() {
  const [status, setStatus] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Fix existing items (recalculate tags from titles)
  const handleFixData = async () => {
    const user = auth.currentUser;
    if (!user) {
      setStatus('Error: Please sign in first');
      return;
    }

    setFixing(true);
    setStatus('Fixing item data (recalculating tags from titles)...');

    try {
      const functions = getFunctions();
      const fixItemData = httpsCallable(functions, 'fixItemData');
      const result = await fixItemData({});
      const data = result.data as any;

      setStatus(`Success! Fixed ${data.itemsFixed} items. ${data.duplicatesRemoved} duplicates removed. ${data.remainingItems} total items.`);
    } catch (error: any) {
      console.error('Fix data error:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  const parseCSV = (csvText: string): Record<string, string>[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const parseCSVLine = (line: string): string[] => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current);
      return values.map(v => v.trim());
    };

    const headers = parseCSVLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    return rows;
  };

  // Map item to correct tag based on Title (Vendoo categories are unreliable)
  const mapTitleToTags = (title: string, _category: string): string[] => {
    const titleLower = title.toLowerCase();

    // 1. JERSEY - Check first (very specific keyword)
    if (titleLower.includes('jersey')) return ['Jersey'];

    // 2. HOODIE - Check before jackets (hoodies are specific)
    if (titleLower.includes('hoodie') || titleLower.includes('hoody') ||
        (titleLower.includes('sweatshirt') && !titleLower.includes('crewneck'))) {
      return ['Hoodie'];
    }

    // 3. POLO SHIRTS - Must have "polo" AND "shirt" or be from Lacoste/specific polo context
    // Exclude "Polo Ralph Lauren" brand name false positives
    const isPoloShirt = (
      (titleLower.includes('polo') && titleLower.includes('shirt')) ||
      (titleLower.includes('polo') && !titleLower.includes('ralph lauren') && !titleLower.includes('pullover')) ||
      titleLower.includes('lacoste') && !titleLower.includes('jacket')
    );
    if (isPoloShirt) return ['Polo'];

    // 4. JACKETS/PULLOVERS - Outerwear
    if (titleLower.includes('jacket') || titleLower.includes('windbreaker') ||
        titleLower.includes('bomber') || titleLower.includes('coat') ||
        titleLower.includes('1/4 zip') || titleLower.includes('quarter zip') ||
        titleLower.includes('quarter-zip') || titleLower.includes('fleece') ||
        (titleLower.includes('pullover') && !titleLower.includes('hoodie')) ||
        titleLower.includes('crewneck') || titleLower.includes('sweater')) {
      return ['Pullover/Jackets'];
    }

    // 5. BOTTOMS - Pants, shorts, jeans
    if (titleLower.includes('pant') || titleLower.includes('short') ||
        titleLower.includes('jeans') || titleLower.includes('trouser') ||
        titleLower.includes('bottom')) {
      return ['Bottoms'];
    }

    // 6. T-SHIRTS - Generic shirts, tees
    if (titleLower.includes('t-shirt') || titleLower.includes('tshirt') ||
        titleLower.includes(' tee ') || titleLower.includes(' tee') ||
        (titleLower.includes('shirt') && !titleLower.includes('polo'))) {
      return ['T-shirts'];
    }

    // Default: T-shirts (most common item type)
    return ['T-shirts'];
  };

  // Detect duplicate items based on title similarity
  const removeDuplicates = (rows: Record<string, string>[]): Record<string, string>[] => {
    const seen = new Map<string, Record<string, string>>();
    const duplicates: string[] = [];

    for (const row of rows) {
      const title = (row['Title'] || '').toLowerCase().trim();
      // Create a normalized key (remove extra spaces, lowercase)
      const normalizedTitle = title.replace(/\s+/g, ' ');

      if (seen.has(normalizedTitle)) {
        duplicates.push(row['Title'] || 'Unknown');
      } else {
        seen.set(normalizedTitle, row);
      }
    }

    if (duplicates.length > 0) {
      console.log(`Removed ${duplicates.length} duplicates:`, duplicates.slice(0, 5));
    }

    return Array.from(seen.values());
  };

  // Extract size from title (e.g., "Men's Large", "Size XL", "Mens M")
  const extractSizeFromTitle = (title: string): string => {
    const titleLower = title.toLowerCase();

    // Common size patterns
    const sizePatterns = [
      /\b(xxs|xs|small|medium|large|x-large|xx-large|xxx-large)\b/i,
      /\b(2xs|3xs|4xs|s|m|l|xl|2xl|3xl|4xl|xxl|xxxl|xxxxl)\b/i,
      /\bsize\s*(\w+)\b/i,
      /\bmens?\s*(\w+)\b/i,
      /\bwomens?\s*(\w+)\b/i,
      /\byouth\s*(\w+)\b/i,
    ];

    for (const pattern of sizePatterns) {
      const match = titleLower.match(pattern);
      if (match) {
        const size = match[1] || match[0];
        // Normalize common sizes
        const sizeMap: Record<string, string> = {
          'small': 'S', 'medium': 'M', 'large': 'L',
          'x-large': 'XL', 'xx-large': 'XXL', 'xxx-large': 'XXXL',
        };
        return sizeMap[size.toLowerCase()] || size.toUpperCase();
      }
    }
    return '';
  };

  const mapCSVRowToItem = (row: Record<string, string>, userId: string) => {
    const title = row['Title'] || 'Untitled Item';
    const priceStr = (row['Price'] || '0').replace(/[^0-9.]/g, '');
    const priceCents = Math.round((parseFloat(priceStr) || 0) * 100);

    const costStr = (row['Cost of Goods'] || '0').replace(/[^0-9.]/g, '');
    const costCents = Math.round((parseFloat(costStr) || 0) * 100);

    const soldPriceStr = (row['Price Sold'] || '0').replace(/[^0-9.]/g, '');
    const soldPriceCents = parseFloat(soldPriceStr) > 0 ? Math.round(parseFloat(soldPriceStr) * 100) : null;

    const imageUrl = row['Images'] || '';
    const status = row['Status'] === 'Sold' ? 'SOLD' : 'IN_STOCK';

    // Generate unique barcode for QR
    const barcode = row['Sku'] || `VC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Extract size from title or use Primary Color as fallback
    const size = extractSizeFromTitle(title) || row['Primary Color'] || '';

    // Use title-based tag mapping (more accurate than Vendoo categories)
    const tags = mapTitleToTags(title, row['Category'] || '');

    return {
      user_uuid: userId,
      title,
      size,
      status,
      normalizedTags: tags,
      imageUrls: imageUrl ? [imageUrl] : [],
      manualPriceCents: priceCents > 0 ? priceCents : null,
      purchasePriceCents: costCents > 0 ? costCents : null,
      soldPriceCents: status === 'SOLD' ? soldPriceCents : null,
      soldDate: status === 'SOLD' && row['Sold Date'] ? row['Sold Date'] : null,
      purchaseDate: row['Listed Date'] || null,
      notes: [
        row['Brand'] ? `Brand: ${row['Brand']}` : '',
        row['Condition'] ? `Condition: ${row['Condition']}` : '',
        row['Sku'] ? `SKU: ${row['Sku']}` : '',
        row['Internal Notes'] || '',
      ].filter(Boolean).join('. '),
      conditionNotes: row['Description'] || '',
      brand: row['Brand'] || 'Unknown',
      category: row['Category'] || 'Clothing',
      barcode, // For QR code scanning
      listingPlatforms: row['Listing Platforms'] || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) {
      setStatus('Error: Please sign in first');
      return;
    }

    setImporting(true);
    setStatus('Reading CSV file...');

    try {
      const csvText = await file.text();
      const allRows = parseCSV(csvText);

      // Remove duplicates
      const rows = removeDuplicates(allRows);
      const duplicatesRemoved = allRows.length - rows.length;

      setProgress({ current: 0, total: rows.length });
      setStatus(`Found ${allRows.length} items (${duplicatesRemoved} duplicates removed). Deleting existing items...`);

      // Delete existing items
      const existingQuery = query(collection(db, 'Item'), where('user_uuid', '==', user.uid));
      const existingDocs = await getDocs(existingQuery);

      for (const doc of existingDocs.docs) {
        await deleteDoc(doc.ref);
      }
      setStatus(`Deleted ${existingDocs.size} existing items. Importing new items...`);

      // Import new items
      let successCount = 0;
      for (let i = 0; i < rows.length; i++) {
        const item = mapCSVRowToItem(rows[i], user.uid);
        await addDoc(collection(db, 'Item'), item);
        successCount++;
        setProgress({ current: successCount, total: rows.length });

        if (successCount % 10 === 0) {
          setStatus(`Importing... ${successCount}/${rows.length}`);
        }
      }

      setStatus(`Success! Imported ${successCount} items.`);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Import CSV</h1>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <p className="text-gray-300 mb-4">
            Upload your CSV export to import all items into your closet.
            This will <span className="text-red-400 font-semibold">delete all existing items</span> and replace them with the CSV data.
          </p>

          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={importing}
            className="block w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700 disabled:opacity-50"
          />

          {progress.total > 0 && (
            <div className="mt-4">
              <div className="bg-gray-700 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-purple-600 h-full transition-all duration-200"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-gray-400 text-sm mt-2">{progress.current} / {progress.total}</p>
            </div>
          )}

          {status && (
            <div className={`mt-4 p-3 rounded-lg ${status.includes('Error') ? 'bg-red-500/20 text-red-400' : status.includes('Success') ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {status}
            </div>
          )}
        </div>

        {/* Fix Data Section */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Fix Existing Items</h2>
          <p className="text-gray-300 mb-4">
            Recalculate tags from item titles. This fixes items that were imported with incorrect tags
            (like "eBay Import") and sorts them into the correct categories.
          </p>
          <button
            type="button"
            onClick={handleFixData}
            disabled={fixing || importing}
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fixing ? 'Fixing...' : 'Fix Item Tags'}
          </button>
        </div>

        <div className="mt-4">
          <a href="/closet" className="text-purple-400 hover:text-purple-300">
            &larr; Back to Closet
          </a>
        </div>
      </div>
    </div>
  );
}
