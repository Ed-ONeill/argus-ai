import { useQuery } from "@tanstack/react-query";
import { fetchEntityRelationships, type EntityRelationships } from "@/lib/api";

// The recorded market connections for one entity (the company's durable relationship memory).
// Honest-null contract: fetchEntityRelationships returns null on transport/service error, and
// the query is disabled until a uid is known, so consumers can distinguish "loading" from
// "unreachable" from "no recorded connections". Cached for the session like other memory reads.
export function useEntityRelationships(uid: string | null) {
  return useQuery<EntityRelationships | null>({
    queryKey: ["entity-relationships", uid],
    queryFn: () => (uid ? fetchEntityRelationships(uid) : Promise.resolve(null)),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
  });
}
