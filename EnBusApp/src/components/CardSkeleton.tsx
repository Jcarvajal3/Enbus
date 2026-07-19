import React, { memo } from 'react';
import { View } from '@/tw';
import { SkeletonLoader } from './SkeletonLoader';

interface CardSkeletonProps {
  /** Number of placeholder rows to render. Defaults to 3. */
  count?: number;
}

/**
 * REF-01: Reusable card skeleton placeholder.
 *
 * The identical skeleton JSX was duplicated verbatim in:
 *   - app/(tabs)/index.tsx (×2 sections)
 *   - app/(tabs)/boletos.tsx
 *   - app/(tabs)/encomiendas.tsx
 *
 * Centralising it here means any future design changes to the placeholder
 * only need to happen in one place.
 */
export const CardSkeleton = memo(({ count = 3 }: CardSkeletonProps) => (
  <View className="flex-col gap-3 w-full">
    {Array.from({ length: count }, (_, i) => (
      <View key={i} className="bg-card p-[18px] rounded-[20px] flex-row items-center gap-3">
        <SkeletonLoader width={40} height={40} borderRadius={20} />
        <View className="flex-1 gap-1.5">
          <SkeletonLoader width="65%" height={14} />
          <SkeletonLoader width="35%" height={10} />
        </View>
      </View>
    ))}
  </View>
));

CardSkeleton.displayName = 'CardSkeleton';
