"use client";

import { useQuery } from "@tanstack/react-query";
import type { IPOFiler } from "@/app/api/ipo-pipeline/route";

export type { IPOFiler };

export interface IPOPipelineResult {
  filers:    IPOFiler[];
  isLoading: boolean;
  isError:   boolean;
  refetch:   () => void;
}

export function useIPOPipeline(): IPOPipelineResult {
  const query = useQuery<IPOFiler[]>({
    queryKey:        ["ipo-pipeline"],
    queryFn:         () => fetch("/api/ipo-pipeline").then(r => r.json()),
    staleTime:       55 * 60 * 1_000,   // just under the 1h server cache
    refetchInterval: 60 * 60 * 1_000,
    retry:           2,
    retryDelay:      (n) => Math.min(2_000 * 2 ** n, 30_000),
    placeholderData: (prev) => prev,
  });

  return {
    filers:    query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
