import { useState, useEffect } from 'react';
import { TrendingUp, ExternalLink, Loader2, DollarSign } from 'lucide-react';
import { getCompsForItem, getCompStats, type ClothingComp } from '../services/comps';
import type { Item } from '../types/item';

interface CompsDrawerProps {
  item: Item;
  isOpen: boolean;
  onClose: () => void;
}

export function CompsDrawer({ item, isOpen, onClose }: CompsDrawerProps) {
  const [comps, setComps] = useState<ClothingComp[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadComps();
    }
  }, [isOpen, item.id]);

  const loadComps = async () => {
    setLoading(true);
    try {
      const results = await getCompsForItem({
        name: item.name,
        size: item.size,
        tags: item.tags
      });
      setComps(results);
    } catch (error) {
      console.error('Error loading comps:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = getCompStats(comps);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-4xl rounded-t-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-6 sm:rounded-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Comparable Sales</h2>
            <p className="mt-1 text-sm text-gray-400">
              {item.name} - {item.size}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Stats */}
        {!loading && comps.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Avg Price"
              value={`$${stats.avgPrice.toFixed(2)}`}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <StatCard
              label="Median"
              value={`$${stats.medianPrice.toFixed(2)}`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatCard
              label="Range"
              value={`$${stats.minPrice}-$${stats.maxPrice}`}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <StatCard
              label="Total Comps"
              value={stats.count.toString()}
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>
        )}

        {/* Comps List */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
          ) : comps.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <p>No comparable sales found.</p>
              <p className="mt-2 text-sm">
                Try running the scraper to find comps for this item.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {comps.map((comp) => (
                <CompCard key={comp.id} comp={comp} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-800/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-gray-400">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function CompCard({ comp }: { comp: ClothingComp }) {
  const marketplaceColors = {
    ebay: 'bg-blue-500/20 text-blue-400',
    poshmark: 'bg-pink-500/20 text-pink-400',
    mercari: 'bg-orange-500/20 text-orange-400',
    depop: 'bg-red-500/20 text-red-400',
    grailed: 'bg-gray-500/20 text-gray-400',
  };

  const similarityColor = (score: number | null) => {
    if (!score) return 'text-gray-400';
    if (score >= 0.8) return 'text-green-400';
    if (score >= 0.6) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <div className="flex gap-4 rounded-lg bg-gray-800/50 p-4 hover:bg-gray-800/70">
      {/* Image */}
      {comp.image_urls && comp.image_urls[0] ? (
        <img
          src={comp.image_urls[0]}
          alt={comp.title}
          className="h-20 w-20 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gray-700">
          <span className="text-2xl">👕</span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-medium text-white">{comp.title}</h3>
          <div className="flex-shrink-0">
            <p className="text-xl font-bold text-green-400">${comp.price.toFixed(2)}</p>
            {comp.shipping_cost > 0 && (
              <p className="text-xs text-gray-400">+${comp.shipping_cost} ship</p>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Marketplace Badge */}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
              marketplaceColors[comp.source_marketplace]
            }`}
          >
            {comp.source_marketplace}
          </span>

          {/* Similarity Score */}
          {comp.similarity_score !== null && (
            <span className={`text-xs font-medium ${similarityColor(comp.similarity_score)}`}>
              {(comp.similarity_score * 100).toFixed(0)}% match
            </span>
          )}

          {/* Size */}
          {comp.size && (
            <span className="text-xs text-gray-400">Size: {comp.size}</span>
          )}

          {/* Sold Date */}
          {comp.sold_date && (
            <span className="text-xs text-gray-400">
              Sold: {new Date(comp.sold_date).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Link */}
        <a
          href={comp.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
        >
          View listing
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
