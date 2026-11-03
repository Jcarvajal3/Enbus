import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/src/components/ui';
import { ScreenSkeleton } from '@/src/components/SkeletonLoader';

/**
 * Legacy deep-link target. Search results now live inside the `buscar` wizard,
 * so this route forwards its params there.
 */
export default function ResultadosRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    router.replace({ pathname: '/boletos/buscar', params });
  }, [params, router]);

  return (
    <Screen>
      <ScreenSkeleton variante="lista" />
    </Screen>
  );
}
