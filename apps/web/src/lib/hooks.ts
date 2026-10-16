import { useInfiniteQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { errorMessage, type ApiResult } from '../api/client';
import { useToast } from '../components/toast';

/** Cursor-paginated list over an endpoint that returns `meta.page`. */
export function useCursorList<T>(key: QueryKey, fetchPage: (cursor: string | undefined) => Promise<ApiResult<T[]>>) {
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.page?.hasMore ? (last.page.nextCursor ?? undefined) : undefined),
  });
  return { ...query, items: query.data?.pages.flatMap((p) => p.data) ?? [] };
}

/**
 * Mutation that toasts on success/error and invalidates the given query keys.
 * Field validation errors stay on `mutation.error` for forms to render.
 */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult, vars: TVars) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      await Promise.all((opts.invalidate ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      opts.onSuccess?.(result, vars);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return debounced;
}

/** Browser geolocation for check-in / punch flows (mobile uses geolocator). */
export function getPosition(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
