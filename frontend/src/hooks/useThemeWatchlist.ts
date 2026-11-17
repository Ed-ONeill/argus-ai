"use client";
import { useFollowedThemes } from "./useFollowedThemes";
/** Both entry points operate on the same account-owned theme subscription. */
export function useThemeWatchlist() {
  const { followedIds, isFollowed, follow, unfollow, error } = useFollowedThemes();
  return { watchedIds: followedIds, isWatched: isFollowed, error,
    toggle: (id: string) => isFollowed(id) ? unfollow(id) : follow({ id }, id) };
}
