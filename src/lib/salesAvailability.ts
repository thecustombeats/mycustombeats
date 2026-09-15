import { useEffect, useState } from "react";

/**
 * Products whose NEW sales MCB has suspended (GET /api/product-availability):
 * catalogue SKUs or product ids, nothing else. The site shows them as
 * "Currently unavailable"; the server refuses them at pricing and checkout
 * whatever this page shows. Without the API (a static preview) nothing is
 * marked unavailable.
 */
export const CURRENTLY_UNAVAILABLE = "Currently unavailable";

export const useSalesAvailability = (): ReadonlySet<string> => {
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    fetch("/api/product-availability", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload && Array.isArray(payload.unavailable)) {
          setUnavailable(new Set(payload.unavailable.filter((v: unknown): v is string => typeof v === "string")));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return unavailable;
};
