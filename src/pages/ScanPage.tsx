import { useState } from 'react';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BatchPrintModal } from '../components/BatchPrintModal';
import { useItemStore } from '../store/useItemStore';
import { Camera, Printer } from 'lucide-react';

export const ScanPage = () => {
  const [isScannerOpen, setIsScannerOpen] = useState(true);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const { items } = useItemStore();

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Camera className="h-8 w-8 text-purple-400" />
            <h1 className="text-3xl font-bold text-white">Barcode Scanner</h1>
          </div>
          <p className="text-gray-400">
            Scan item barcodes to quickly view details and manage your inventory
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors"
          >
            <Printer className="h-5 w-5" />
            Print All Barcodes ({items.filter(i => i.barcode).length})
          </button>
        </div>

        <BarcodeScanner
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
        />

        {!isScannerOpen && (
          <div className="flex items-center justify-center mt-8">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors"
            >
              <Camera className="h-5 w-5" />
              Open Scanner
            </button>
          </div>
        )}

        {/* Batch Print Modal */}
        <BatchPrintModal
          items={items}
          open={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
        />
      </div>
    </div>
  );
};
