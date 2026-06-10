import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import { useAuthStore } from '../store/useAuthStore';
import { generateBarcode } from '../services/barcodes';
import { database } from '../lib/database/client';

interface CSVImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface CSVRow {
  name: string;
  size: string;
  quantity: number;
  price?: number;
  tags?: string[];
}

interface ImportResult {
  success: number;
  updated: number;
  created: number;
  errors: string[];
}

export const CSVImportModal: React.FC<CSVImportModalProps> = ({
  open,
  onClose,
  onImportComplete,
}) => {
  const { user } = useAuthStore();
  const [csvFile, setCSVFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [previewData, setPreviewData] = useState<CSVRow[]>([]);

  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.trim().split('\n');
    if (lines.length === 0) return [];

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('title'));
    const sizeIdx = headers.findIndex(h => h.includes('size'));
    const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity'));
    const priceIdx = headers.findIndex(h => h.includes('price'));
    const tagsIdx = headers.findIndex(h => h.includes('tag'));

    if (nameIdx === -1) {
      throw new Error('CSV must have a "Name" or "Title" column');
    }

    if (sizeIdx === -1) {
      throw new Error('CSV must have a "Size" column');
    }

    // Parse rows
    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length === 0 || !values[nameIdx]) continue;

      const name = values[nameIdx];
      const size = sizeIdx !== -1 ? values[sizeIdx] : '';
      const quantity = qtyIdx !== -1 && values[qtyIdx] ? parseInt(values[qtyIdx]) : 1;
      const price = priceIdx !== -1 && values[priceIdx] ? parseFloat(values[priceIdx]) : undefined;
      const tags = tagsIdx !== -1 && values[tagsIdx] ? values[tagsIdx].split('|').map(t => t.trim()) : undefined;

      rows.push({ name, size, quantity, price, tags });
    }

    return rows;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCSVFile(file);
    setImportResult(null);

    // Preview CSV
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        setPreviewData(rows.slice(0, 5)); // Show first 5 rows
        toast.success(`Loaded ${rows.length} items from CSV`);
      } catch (error: any) {
        toast.error(error.message);
        setCSVFile(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvFile || !user) return;

    setIsImporting(true);
    const result: ImportResult = {
      success: 0,
      updated: 0,
      created: 0,
      errors: []
    };

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          const rows = parseCSV(text);

          const db = getFirestore(app);
          const itemsRef = collection(db, 'Item');

          for (const row of rows) {
            try {
              // Find existing item with same name + size
              const q = query(
                itemsRef,
                where('user_uuid', '==', user.id),
                where('title', '==', row.name),
                where('size', '==', row.size)
              );

              const existingDocs = await getDocs(q);

              if (!existingDocs.empty) {
                // Item exists - update quantity
                const existingDoc = existingDocs.docs[0];
                const existingData = existingDoc.data();
                const currentQty = existingData.ebayQuantity || 0;
                const newQty = currentQty + row.quantity;

                await updateDoc(doc(db, 'Item', existingDoc.id), {
                  ebayQuantity: newQty,
                  updatedAt: serverTimestamp(),
                });

                result.updated++;
                result.success++;
                console.log(`✅ Updated ${row.name} (${row.size}): ${currentQty} → ${newQty}`);
              } else {
                // Item doesn't exist - create new
                const barcode = await generateBarcode(user.id, database);

                const newItem = {
                  user_uuid: user.id,
                  title: row.name,
                  size: row.size,
                  status: 'IN_STOCK',
                  normalizedTags: row.tags || [],
                  imageUrls: [],
                  manualPriceCents: row.price ? Math.round(row.price * 100) : null,
                  ebayQuantity: row.quantity,
                  barcode: barcode,
                  createdAt: new Date().toISOString(),
                  updatedAt: serverTimestamp(),
                };

                await addDoc(itemsRef, newItem);

                result.created++;
                result.success++;
                console.log(`✅ Created ${row.name} (${row.size}) qty ${row.quantity}`);
              }
            } catch (err: any) {
              result.errors.push(`${row.name} (${row.size}): ${err.message}`);
              console.error(`❌ Error importing ${row.name}:`, err);
            }
          }

          setImportResult(result);

          if (result.success > 0) {
            toast.success(`Imported ${result.success} items! (${result.created} new, ${result.updated} updated)`);
            onImportComplete();
          }

          if (result.errors.length > 0) {
            toast.error(`${result.errors.length} items failed to import`);
          }
        } catch (error: any) {
          toast.error('Failed to parse CSV: ' + error.message);
        } finally {
          setIsImporting(false);
        }
      };

      reader.readAsText(csvFile);
    } catch (error: any) {
      toast.error('Import failed: ' + error.message);
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (!isImporting) {
      setCSVFile(null);
      setPreviewData([]);
      setImportResult(null);
      onClose();
    }
  };

  return (
    <Modal open={open} onOpenChange={handleClose} title="Import Inventory from CSV">
      <div className="space-y-4">
        {/* Instructions */}
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-300">
              <p className="font-semibold text-white mb-1">CSV Format:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Required:</strong> Name, Size</li>
                <li><strong>Optional:</strong> Quantity, Price, Tags</li>
                <li>If item exists (same name + size), quantity will be added</li>
                <li>If item doesn't exist, it will be created</li>
              </ul>
            </div>
          </div>
        </div>

        {/* File Upload */}
        <div className="space-y-2">
          <label className="block">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={isImporting}
              className="hidden"
            />
            <div className="cursor-pointer border-2 border-dashed border-gray-600 rounded-lg p-6 hover:border-blue-500 transition-colors">
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-400">
                  {csvFile ? csvFile.name : 'Click to upload CSV file'}
                </p>
              </div>
            </div>
          </label>
        </div>

        {/* Preview */}
        {previewData.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white">Preview (first 5 rows):</h4>
            <div className="bg-gray-800/50 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-2 text-gray-400">Name</th>
                    <th className="text-left p-2 text-gray-400">Size</th>
                    <th className="text-left p-2 text-gray-400">Qty</th>
                    <th className="text-left p-2 text-gray-400">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-700/50">
                      <td className="p-2 text-white">{row.name}</td>
                      <td className="p-2 text-gray-300">{row.size}</td>
                      <td className="p-2 text-gray-300">{row.quantity}</td>
                      <td className="p-2 text-gray-300">{row.price ? `$${row.price.toFixed(2)}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Result */}
        {importResult && (
          <div className="space-y-2">
            <div className={`rounded-lg p-4 ${
              importResult.errors.length === 0
                ? 'bg-green-900/20 border border-green-700/30'
                : 'bg-yellow-900/20 border border-yellow-700/30'
            }`}>
              <div className="flex items-start gap-2">
                {importResult.errors.length === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white mb-2">Import Complete</p>
                  <ul className="text-xs text-gray-300 space-y-1">
                    <li>✅ {importResult.success} successful</li>
                    <li>🆕 {importResult.created} created</li>
                    <li>📈 {importResult.updated} updated (quantity added)</li>
                    {importResult.errors.length > 0 && (
                      <li className="text-yellow-400">⚠️ {importResult.errors.length} errors</li>
                    )}
                  </ul>

                  {importResult.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-yellow-400 hover:text-yellow-300">
                        Show errors
                      </summary>
                      <ul className="mt-2 text-xs text-gray-400 space-y-1">
                        {importResult.errors.map((err, idx) => (
                          <li key={idx}>• {err}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2">
          <Button
            onClick={handleClose}
            variant="secondary"
            disabled={isImporting}
          >
            {importResult ? 'Close' : 'Cancel'}
          </Button>
          {csvFile && !importResult && (
            <Button
              onClick={handleImport}
              disabled={isImporting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isImporting ? 'Importing...' : 'Import to Firebase'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
