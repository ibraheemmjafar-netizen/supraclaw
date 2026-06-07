/**
 * useOraclePrice.ts
 *
 * Fetches live SUPRA/USD price using Supra's own oracle REST API.
 * Falls back to CoinGecko if the Supra endpoint is unavailable.
 *
 * Supra Push Oracle REST:
 *   GET https://prod-kv-storage.s3.us-east-2.amazonaws.com/price_data.json
 *   Contains all oracle pairs including SUPRA_USDT (pair index 400)
 *
 * Refreshes every 30 seconds while the component is mounted.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const REFRESH_INTERVAL_MS = 30_000;

// Supra's oracle S3 price feed (no auth required, public)
const SUPRA_ORACLE_URL =
  "https://prod-kv-storage.s3.us-east-2.amazonaws.com/price_data.json";

// CoinGecko fallback (public, no key for basic use)
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=supra&vs_currencies=usd";

interface OraclePriceState {
  supraUsd: number | null;     // current SUPRA price in USD
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;
}

/**
 * Attempt to read SUPRA/USDT from the Supra oracle price feed.
 * The oracle JSON is an array of pairs; SUPRA_USDT is pair index 400.
 */
async function fetchFromSupraOracle(): Promise<number> {
  const res = await fetch(SUPRA_ORACLE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Oracle HTTP ${res.status}`);
  const json = await res.json() as unknown;

  // The oracle payload looks like: { "400": { "price": "0.023456", ... } }
  // OR an array where index 400 holds SUPRA_USDT
  const data = json as Record<string, { price?: string; value?: string } | undefined>;

  const entry = data["400"];
  if (!entry) throw new Error("SUPRA pair not found in oracle feed");

  const raw = entry.price ?? entry.value ?? "";
  const price = parseFloat(raw);
  if (isNaN(price) || price <= 0) throw new Error("Invalid oracle price");
  return price;
}

/** Fallback: CoinGecko public API */
async function fetchFromCoinGecko(): Promise<number> {
  const res = await fetch(COINGECKO_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = await res.json() as { supra?: { usd?: number } };
  const price = json?.supra?.usd;
  if (!price || price <= 0) throw new Error("CoinGecko returned no price");
  return price;
}

export function useOraclePrice(): OraclePriceState {
  const [state, setState] = useState<OraclePriceState>({
    supraUsd: null,
    loading: true,
    lastUpdated: null,
    error: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrice = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // CoinGecko public API — CORS-safe from browser, no key required
      // The Supra oracle S3 endpoint blocks cross-origin requests from browsers,
      // so we use CoinGecko directly and reserve the S3 feed for server-side use.
      const price = await fetchFromCoinGecko();
      setState({ supraUsd: price, loading: false, lastUpdated: new Date(), error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Price unavailable";
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    intervalRef.current = setInterval(fetchPrice, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPrice]);

  return state;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a SUPRA amount to USD string. Returns null if price unavailable. */
export function supraToUsd(
  supraAmount: number,
  supraUsdPrice: number | null
): string | null {
  if (supraUsdPrice === null || supraUsdPrice <= 0) return null;
  const usd = supraAmount * supraUsdPrice;
  if (usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}
