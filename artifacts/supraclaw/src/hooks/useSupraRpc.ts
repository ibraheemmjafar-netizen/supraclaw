/**
 * useSupraRpc.ts
 * Scans a connected Supra wallet for burnable tokens and NFTs.
 *
 * Verified flow:
 *  1. GET /rpc/v1/accounts/{addr}/resources  → find all CoinStore<T> types
 *  2. POST /rpc/v1/view 0x1::coin::balance   → get balance per coin (parallel)
 *  3. POST /rpc/v1/view 0x1::coin::name      → get human name per coin (parallel)
 *  4. POST /rpc/v1/view 0x1::coin::decimals  → get decimals per coin (parallel)
 *  5. GET deposit_events on TokenStore       → discover v1 NFTs
 */

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchAccountResources,
  getCoinStoreResources,
  extractCoinType,
  fetchCoinBalance,
  fetchCoinName,
  fetchCoinSymbol,
  fetchCoinDecimals,
  hasTokenStore,
  fetchV1NftDepositEvents,
} from "@/lib/supraTransaction";

export interface BurnableAsset {
  id: string;
  name: string;
  symbol?: string;
  balance: number;
  rawBalance: string;
  decimals: number;
  estimatedRebate: number;
  type: "fungible" | "nft";
  collection?: string;
  coinType?: string;
  objectAddress?: string;
}

// ─── Mock data (demo / wallet not connected) ──────────────────────────────────

const MOCK_TOKENS: BurnableAsset[] = [
  { id: "mock-1", name: "SUPRA OG", symbol: "OG", balance: 8023, rawBalance: "8023", decimals: 6, estimatedRebate: 0.001, type: "fungible", coinType: "0xd0f37da5c7a0104d8cb161e1ac1e101f90b702c18081b76b62f20137bf40fd0b::OG::OG" },
  { id: "mock-2", name: "LEO", symbol: "LEO", balance: 5000, rawBalance: "5000000000", decimals: 6, estimatedRebate: 0.001, type: "fungible", coinType: "0x83e6ebf0e08121734b117daf65677c77185e151114364f7c53bc2366f2c64a12::LEO::LEO" },
  { id: "mock-3", name: "DAWGZ", symbol: "DAWGZ", balance: 420, rawBalance: "420000000", decimals: 6, estimatedRebate: 0.001, type: "fungible", coinType: "0xb8e94e7204d8eeb565a653d262ae6f7434a3a452e2aaf624810b33dfa3b64d09::DAWGZ::DAWGZ" },
];

const MOCK_NFTS: BurnableAsset[] = [
  { id: "mock-nft-1", name: "Crystara #4201", collection: "Crystara Genesis", estimatedRebate: 0.005, type: "nft", balance: 1, rawBalance: "1", decimals: 0 },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSupraRpc() {
  const { address, network, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<BurnableAsset[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  const scanWallet = useCallback(async () => {
    if (!connected || !address) {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 600));
      setAssets([...MOCK_TOKENS, ...MOCK_NFTS]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setScanError(null);

    try {
      // Step 1: fetch all resources
      const resources = await fetchAccountResources(address, network);
      console.log(`[supraclaw] ${resources.length} resources found for ${address}`);

      // Step 2: filter to CoinStore resources (non-SUPRA)
      const coinStores = getCoinStoreResources(resources);
      console.log(`[supraclaw] ${coinStores.length} CoinStore resources`);

      // Step 3: for each coin, fetch balance + name + symbol + decimals in parallel
      const fungibles: BurnableAsset[] = (
        await Promise.all(
          coinStores.map(async (r, i) => {
            const coinType = extractCoinType(r);
            if (!coinType) return null;

            const [balance, name, symbol, decimals] = await Promise.all([
              fetchCoinBalance(coinType, address, network),
              fetchCoinName(coinType, network),
              fetchCoinSymbol(coinType, network),
              fetchCoinDecimals(coinType, network),
            ]);

            if (balance === 0) return null; // skip empty stores

            return {
              id: `coin-${i}-${coinType}`,
              name,
              symbol,
              balance: balance / Math.pow(10, decimals),
              rawBalance: balance.toString(),
              decimals,
              estimatedRebate: 0.001, // ~0.001 SUPRA per coin slot freed
              type: "fungible" as const,
              coinType,
            };
          })
        )
      ).filter((x): x is BurnableAsset => x !== null);

      console.log(`[supraclaw] ${fungibles.length} non-zero tokens`);

      // Step 4: fetch v1 NFTs from TokenStore deposit events
      const nfts: BurnableAsset[] = [];
      if (hasTokenStore(resources)) {
        const nftEvents = await fetchV1NftDepositEvents(address, network, 100);
        // Deduplicate by name+collection (deposit events may repeat)
        const seen = new Set<string>();
        nftEvents.forEach((ev, i) => {
          const key = `${ev.collection}::${ev.name}::${ev.propertyVersion}`;
          if (seen.has(key)) return;
          seen.add(key);
          nfts.push({
            id: `nft-${i}-${key}`,
            name: ev.name,
            collection: ev.collection,
            estimatedRebate: 0.004,
            type: "nft",
            balance: 1,
            rawBalance: "1",
            decimals: 0,
            objectAddress: `${ev.creator}::${ev.collection}::${ev.name}`,
          });
        });
        console.log(`[supraclaw] ${nfts.length} v1 NFTs found`);
      }

      setAssets([...fungibles, ...nfts]);

      if (fungibles.length === 0 && nfts.length === 0) {
        setScanError("No burnable assets found in this wallet.");
      }
    } catch (err) {
      console.error("[supraclaw] scan error:", err);
      setScanError(err instanceof Error ? err.message : "Scan failed");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [address, network, connected]);

  useEffect(() => {
    scanWallet();
  }, [scanWallet]);

  const tokens = assets.filter((a) => a.type === "fungible");
  const nfts = assets.filter((a) => a.type === "nft");
  const removeAssets = (ids: string[]) =>
    setAssets((prev) => prev.filter((a) => !ids.includes(a.id)));

  return { loading, assets, tokens, nfts, scanWallet, removeAssets, scanError };
}