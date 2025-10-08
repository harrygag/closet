import React from 'react';
import { Drawer as VaulDrawer } from 'vaul';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  children,
  title,
  description,
}) => {
  return (
    <VaulDrawer.Root open={isOpen} onOpenChange={onClose}>
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
        <VaulDrawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 rounded-t-xl max-h-[85vh] flex flex-col">
          {/* Handle */}
          <div className="flex justify-center p-2">
            <div className="w-12 h-1 bg-gray-600 rounded-full" />
          </div>
          
          {/* Header */}
          {(title || description) && (
            <div className="px-4 pb-2 border-b border-gray-700">
              {title && (
                <h2 className="text-lg font-semibold text-white">{title}</h2>
              )}
              {description && (
                <p className="text-sm text-gray-400 mt-1">{description}</p>
              )}
            </div>
          )}
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {children}
          </div>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
};
