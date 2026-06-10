import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Check, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { useInventoryScanStore } from '../../store/useInventoryScanStore';
import { useItemStore } from '../../store/useItemStore';
import type { PhysicalLocation } from '../../types/item';
import { toast } from 'sonner';

interface PhysicalLocationEditorProps {
  className?: string;
}

const RECENT_LOCATIONS_KEY = 'recentPhysicalLocations';
const MAX_RECENT_LOCATIONS = 10;

export const PhysicalLocationEditor: React.FC<PhysicalLocationEditorProps> = ({ className = '' }) => {
  const { selectedRows, bulkUpdateLocation, isProcessing } = useInventoryScanStore();
  const { items } = useItemStore();

  const [zone, setZone] = useState('');
  const [shelf, setShelf] = useState('');
  const [bin, setBin] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [recentLocations, setRecentLocations] = useState<PhysicalLocation[]>([]);
  const [focusedInput, setFocusedInput] = useState<'zone' | 'shelf' | 'bin' | null>(null);

  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Load recent locations from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as PhysicalLocation[];
        setRecentLocations(parsed);
      } catch (error) {
        console.error('Failed to parse recent locations:', error);
      }
    }
  }, []);

  // Get selected items
  const selectedItems = Array.from(selectedRows)
    .map(id => items.find(item => item.id === id))
    .filter(Boolean);

  // Get current location display
  const getCurrentLocationDisplay = (): string => {
    if (selectedItems.length === 0) return 'No items selected';

    const locations = selectedItems
      .map(item => item?.physicalLocation)
      .filter(Boolean);

    if (locations.length === 0) return 'No location set';

    // Check if all locations are the same
    const firstLocation = locations[0];
    const allSame = locations.every(loc =>
      loc?.zone === firstLocation?.zone &&
      loc?.shelf === firstLocation?.shelf &&
      loc?.bin === firstLocation?.bin
    );

    if (allSame) {
      return formatLocation(firstLocation!);
    }

    return 'Mixed';
  };

  // Format location as string
  const formatLocation = (location: PhysicalLocation): string => {
    const parts = [location.zone, location.shelf];
    if (location.bin) {
      parts.push(location.bin);
    }
    return parts.join('-');
  };

  // Save location to recent locations
  const saveToRecentLocations = (location: PhysicalLocation) => {
    // Remove duplicate if exists
    const filtered = recentLocations.filter(
      loc => !(loc.zone === location.zone && loc.shelf === location.shelf && loc.bin === location.bin)
    );

    // Add to beginning
    const updated = [location, ...filtered].slice(0, MAX_RECENT_LOCATIONS);

    setRecentLocations(updated);
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(updated));
  };

  // Auto-fill from recent location
  const fillFromRecent = (location: PhysicalLocation) => {
    setZone(location.zone);
    setShelf(location.shelf);
    setBin(location.bin || '');
    setShowAutocomplete(false);
  };

  // Handle set location
  const handleSetLocation = async () => {
    // Validate
    if (!zone.trim()) {
      toast.error('Zone is required');
      return;
    }

    if (!shelf.trim()) {
      toast.error('Shelf is required');
      return;
    }

    if (selectedRows.size === 0) {
      toast.error('No items selected');
      return;
    }

    const location: PhysicalLocation = {
      zone: zone.trim().toUpperCase(),
      shelf: shelf.trim(),
      bin: bin.trim() || undefined,
    };

    try {
      await bulkUpdateLocation(Array.from(selectedRows), location);
      saveToRecentLocations(location);

      // Clear form
      setZone('');
      setShelf('');
      setBin('');

      toast.success(`Updated location for ${selectedRows.size} item(s)`);
    } catch (error) {
      toast.error('Failed to update location');
      console.error('Location update error:', error);
    }
  };

  // Handle click outside autocomplete
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter recent locations based on current input
  const getFilteredRecentLocations = () => {
    if (!focusedInput) return recentLocations;

    return recentLocations.filter(loc => {
      if (focusedInput === 'zone' && zone) {
        return loc.zone.toLowerCase().startsWith(zone.toLowerCase());
      }
      if (focusedInput === 'shelf' && shelf) {
        return loc.shelf.toLowerCase().startsWith(shelf.toLowerCase());
      }
      if (focusedInput === 'bin' && bin) {
        return loc.bin?.toLowerCase().startsWith(bin.toLowerCase());
      }
      return true;
    });
  };

  const filteredLocations = getFilteredRecentLocations();

  return (
    <div className={`bg-gray-800 rounded-lg border border-gray-700 p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <MapPin className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Physical Location</h3>
          <p className="text-xs text-gray-400">Assign items to Zone-Shelf-Bin</p>
        </div>
      </div>

      {/* Current Location Display */}
      <div className="mb-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-400">
              {selectedRows.size > 0 ? `${selectedRows.size} item(s) selected` : 'No items selected'}
            </span>
          </div>
          <div className="text-sm font-medium text-white">
            {getCurrentLocationDisplay()}
          </div>
        </div>
      </div>

      {/* Location Inputs */}
      <div className="space-y-3 mb-4">
        {/* Zone */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Zone <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={zone}
            onChange={(e) => {
              setZone(e.target.value.toUpperCase());
              setShowAutocomplete(true);
            }}
            onFocus={() => {
              setFocusedInput('zone');
              setShowAutocomplete(true);
            }}
            placeholder="A, B, C..."
            maxLength={3}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 uppercase"
          />
        </div>

        {/* Shelf */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Shelf <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={shelf}
            onChange={(e) => {
              setShelf(e.target.value);
              setShowAutocomplete(true);
            }}
            onFocus={() => {
              setFocusedInput('shelf');
              setShowAutocomplete(true);
            }}
            placeholder="1, 2, 3..."
            maxLength={3}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Bin (Optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Bin <span className="text-gray-500 text-xs">(optional)</span>
          </label>
          <input
            type="text"
            value={bin}
            onChange={(e) => {
              setBin(e.target.value);
              setShowAutocomplete(true);
            }}
            onFocus={() => {
              setFocusedInput('bin');
              setShowAutocomplete(true);
            }}
            placeholder="A, B, C..."
            maxLength={3}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {showAutocomplete && filteredLocations.length > 0 && (
        <div ref={autocompleteRef} className="mb-4 border border-gray-600 rounded-lg overflow-hidden bg-gray-750">
          <div className="px-3 py-2 bg-gray-700 border-b border-gray-600">
            <span className="text-xs font-medium text-gray-400">RECENT LOCATIONS</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredLocations.map((location, index) => (
              <button
                key={index}
                onClick={() => fillFromRecent(location)}
                className="w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors flex items-center justify-between group"
              >
                <span className="text-sm text-white font-mono">
                  {formatLocation(location)}
                </span>
                <Check className="h-4 w-4 text-green-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Set Location Button */}
      <Button
        onClick={handleSetLocation}
        disabled={!zone.trim() || !shelf.trim() || selectedRows.size === 0 || isProcessing}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500"
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Updating...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <MapPin className="h-4 w-4" />
            Set Location
          </span>
        )}
      </Button>

      {/* Helper Text */}
      <div className="mt-3 text-xs text-gray-500 text-center">
        Format: Zone-Shelf-Bin (e.g., A-1-B, C-3)
      </div>
    </div>
  );
};
