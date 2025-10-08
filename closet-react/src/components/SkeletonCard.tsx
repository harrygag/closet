import React from 'react';

export const SkeletonCard: React.FC = () => {
  return (
    <div className="animate-pulse">
      <div 
        className="bg-gray-700 rounded-lg border-2 border-gray-600"
        style={{ 
          aspectRatio: '2.5/3.5', 
          width: '280px',
          maxWidth: '90vw'
        }}
      >
        <div className="h-full p-2 space-y-2">
          {/* Header skeleton */}
          <div className="flex justify-between items-center p-2 border-b border-gray-600">
            <div className="h-3 bg-gray-600 rounded w-16" />
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-600 rounded" />
              <div className="h-3 bg-gray-600 rounded w-12" />
            </div>
          </div>
          
          {/* Image skeleton */}
          <div className="h-32 bg-gray-600 rounded mx-1" />
          
          {/* Thumbnails skeleton */}
          <div className="flex gap-1 mx-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 w-6 bg-gray-600 rounded" />
            ))}
          </div>
          
          {/* Title skeleton */}
          <div className="px-2 py-1 border-b border-gray-600">
            <div className="h-3 bg-gray-600 rounded w-3/4 mx-auto" />
          </div>
          
          {/* Stats skeleton */}
          <div className="px-2 space-y-1">
            <div className="flex gap-1">
              <div className="flex-1 h-6 bg-gray-600 rounded" />
              <div className="flex-1 h-6 bg-gray-600 rounded" />
            </div>
            <div className="flex gap-1">
              <div className="flex-1 h-6 bg-gray-600 rounded" />
              <div className="flex-1 h-6 bg-gray-600 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

