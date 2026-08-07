import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { Asset, AssetType } from "@shared/types/asset";
import { getFirebaseAuth } from "@/config/firebase";
import { assetsSidebarApi } from "../api/assetsSidebarApi";

const DEFAULT_EXPANDED: AssetType[] = [
  "character",
  "style",
  "location",
  "object",
];

export function useAssetsSidebar() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Start as loading until auth is ready
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<AssetType>>(
    () => new Set(DEFAULT_EXPANDED),
  );

  // Ref to track if component is mounted, shared between effect and refresh callback
  const isMountedRef = useRef(true);

  // Cancellation-aware refresh function that respects component lifecycle
  const refresh = useCallback(async (): Promise<void> => {
    if (!isMountedRef.current) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await assetsSidebarApi.list();
      if (isMountedRef.current) {
        setAssets(result.assets ?? []);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load assets");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Wait for auth to be ready before fetching, and refetch when user changes
  // Uses cancellation flag to prevent state updates after unmount or auth changes
  useEffect(() => {
    isMountedRef.current = true;

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (!isMountedRef.current) return;

      if (user) {
        setIsLoading(true);
        setError(null);
        assetsSidebarApi
          .list()
          .then((result) => {
            if (isMountedRef.current) {
              setAssets(result.assets ?? []);
            }
          })
          .catch((err) => {
            if (isMountedRef.current) {
              setError(
                err instanceof Error ? err.message : "Failed to load assets",
              );
            }
          })
          .finally(() => {
            if (isMountedRef.current) {
              setIsLoading(false);
            }
          });
      } else {
        // Clear assets if user logs out
        setAssets([]);
        setIsLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const byType = useMemo(() => {
    const grouped: Record<AssetType, Asset[]> = {
      character: [],
      style: [],
      location: [],
      object: [],
    };
    for (const asset of assets) {
      grouped[asset.type]?.push(asset);
    }
    return grouped;
  }, [assets]);

  const toggleSection = useCallback((type: AssetType) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  return {
    assets,
    byType,
    isLoading,
    error,
    expandedSections,
    toggleSection,
    refresh,
  };
}

export default useAssetsSidebar;
