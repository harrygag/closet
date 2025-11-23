import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface DiagnosticCheck {
  name: string;
  status: 'OK' | 'WARN' | 'FAIL' | 'ERROR';
  details: string;
}

interface DiagnosticsReport {
  success: boolean;
  checks: DiagnosticCheck[];
}

interface DiagnosticsModalProps {
  open: boolean;
  onClose: () => void;
  report: DiagnosticsReport | null;
  isLoading: boolean;
  onRunDiagnostics: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  open,
  onClose,
  report,
  isLoading,
  onRunDiagnostics
}) => {
  return (
    <Modal 
      open={open} 
      onOpenChange={(next) => !next && onClose()} 
      title="Extension Diagnostics" 
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-gray-950 rounded-lg border border-gray-800 p-4 font-mono text-sm max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <div className="animate-spin mr-2">⟳</div> Running diagnostics...
            </div>
          ) : report ? (
            <div className="space-y-2">
              {report.checks.map((check, idx) => (
                <div key={idx} className="flex justify-between items-start border-b border-gray-800 pb-2 last:border-0">
                  <div>
                    <div className="font-bold text-gray-300">{check.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{check.details}</div>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-xs font-bold ${
                    check.status === 'OK' ? 'bg-green-900/30 text-green-400' :
                    check.status === 'WARN' ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-red-900/30 text-red-400'
                  }`}>
                    {check.status}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              Click "Run Diagnostics" to check extension health.
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button 
            onClick={onRunDiagnostics} 
            disabled={isLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isLoading ? 'Running...' : 'Run Diagnostics'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
