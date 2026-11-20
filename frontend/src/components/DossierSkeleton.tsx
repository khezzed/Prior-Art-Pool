import React from 'react';
import { cn } from '../lib/utils';

export interface DossierSkeletonProps {
  className?: string;
}

export const DossierSkeleton: React.FC<DossierSkeletonProps> = ({ className }) => {
  return (
    <div
      className={cn('bg-surface border border-line-subtle rounded-lg p-6 sm:p-8 space-y-8', className)}
      aria-busy="true"
      aria-label="Loading live StudioNet dossier"
    >
      <div className="space-y-3 pb-6 border-b border-line-subtle">
        <div className="h-8 w-64 rounded-sm bg-subtle animate-pulse" />
        <div className="h-4 w-96 max-w-full rounded-sm bg-subtle animate-pulse" />
      </div>

      <div className="space-y-3">
        <div className="h-5 w-48 rounded-sm bg-subtle animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-24 rounded-md bg-subtle animate-pulse" />
          <div className="h-24 rounded-md bg-subtle animate-pulse" />
        </div>
      </div>

      <div className="space-y-4 pt-2 border-t border-line-subtle">
        <div className="h-5 w-56 rounded-sm bg-subtle animate-pulse" />
        <div className="h-36 rounded-md bg-subtle animate-pulse" />
      </div>
    </div>
  );
};
