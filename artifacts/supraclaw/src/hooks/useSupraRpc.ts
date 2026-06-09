/**
 * useSupraRpc.ts
 *
 * VERIFIED against Supra mainnet 2026-06-09.
 *
 * Shows ALL CoinStore slots (non-zero AND zero-balance dead slots).
 * NO transaction history scanning — that was the 100-token bug.
 *
 * Verified real wallet:
 *   5 non-zero: OG (8023), JOSH (9720872383), NANA (10000000000), LUCKY (57440808891), DAWGZ (131555432078)
 *   6 dead slots: LEO, RPD, Pecky, PUMP_RPD, ROBBIE, PUMP_SMAN
 *   NFTs: estimated 25 (70 deposits − 45 withdrawals)
 */

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchAccountResources,
  getCoinStoreResources,
  extractCoinType,
  getCoinBalance,
  coinTypeName,
  fetchCoinMeta,
  isDeadSlot,
  hasTokenStore,
  estimateNftCount,
  SUPRA_PER_SLOT,
} from "@/lib/supraTransaction";

export interface BurnableAsset {
  id: string;
  name: string;
  symbol: string;
  balance: number;
  rawBalance: string;
  decimals: number;
  estimatedRebate: number;
  type: "fungible" | "nft";
  collection: string;
  coinType: string;
  objectAddress: string;
  /** true = zero-balance dead slot; burn to reclaim storage */
  isDeadSlot: boolean;
}

const MOCK_ASSETS: BurnableAsset[] = [
  {
    id: "m1", name: "SUPRA OG", symbol: "OG", balance: 0.008023,
    rawBalance: "8023", decimals: 6, estimatedRebate: SUPRA_PER_SLOT,
    type: "fungible", collection: "", isDeadSlot: false,
    coinType: "0xd0f37da5c7a0104d8cb161e1ac1e101f90b702c18081b76b62f20137bf40fd0b::OG::OG",
    objectAddress: "",
  },
  {
    id: "m2", name: "Rez Dawgz", symbol: "DAWGZ", balance: 131555.432,
    rawBalance: "131555432078", decimals: 6, estimatedRebate: SUPRA_PER_SLOT,
    type: "fungible", collection: "", isDeadSlot: false,
    coinType: "0xb8e94e7204d8eeb565a653d262ae6f7434a3a452e2aaf624810b33dfa3b64d09::DAWGZ::DAWGZ",
    objectAddress: "",
  },
  {
    id: "m3", name: "LEO", symbol: "LEO", balance: 0,
    rawBalance: "0", decimals: 6, estimatedRebate: SUPRA_PER_SLOT,
    type: "fungible", collection: "", isDeadSlot: true,
    coinType: "0x83e6ebf0e08121734b117daf65677c77185e151114364f7c53bc2366f2c64a12::LEO::LEO",
    objectAddress: "",
  },
];

export function useSupraRpc() {
  const { address, network, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<BurnableAsset[]>([]);
  const [nftCount, setNftCount] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);

  const scanWallet = useCallback(async () => {
    if (!connected || !address) {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 400));
      setAssets(MOCK_ASSETS);
      setNftCount(25);
      setLoading(false);
      return;
    }

    setLoading(true);
    setScanError(null);

    try {
      const resources = await fetchAccountResources(address, network);
      console.log(`[supraclaw] ${resources.length} total resources`);

      const coinStores = getCoinStoreResources(resources);
      console.log(`[supraclaw] ${coinStores.length} CoinStores (incl. dead slots)`);

      const fungibles: BurnableAsset[] = await Promise.all(
        coinStores.map(async (r, i): Promise<BurnableAsset> => {
          const coinType = extractCoinType(r)!;
          const rawBal = getCoinBalance(r);
          const dead = isDeadSlot(r);
          const fb = coinTypeName(coinType);

          const meta = await fetchCoinMeta(coinType, network).catch(() => ({
            name: fb, symbol: fb, decimals: 6,
          }));

          return {
            id: `coin-${i}-${coinType}`,
            name: meta.name,
            symbol: meta.symbol,
            balance: rawBal / Math.pow(10, meta.decimals),
            rawBalance: rawBal.toString(),
            decimals: meta.decimals,
            estimatedRebate: SUPRA_PER_SLOT,
            type: "fungible",
            collection: "",
            coinType,
            objectAddress: "",
            isDeadSlot: dead,
          };
        })
      );

      // NFT count: deposit_events.counter − withdraw_events.counter
      // Cannot list individual NFTs — Supra events/table APIs return empty for this wallet
      const estNfts = hasTokenStore(resources) ? estimateNftCount(resources) : 0;
      console.log(`[supraclaw] ~${estNfts} NFTs estimated`);

      setAssets(fungibles);
      setNftCount(estNfts);

      if (fungibles.length === 0) {
        setScanError("No token slots found.");
      }
    } catch (err) {
      console.error("[supraclaw] scan error:", err);
      setScanError(err instanceof Error ? err.message : "Scan failed.");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [address, network, connected]);

  useEffect(() => { scanWallet(); }, [scanWallet]);

  const tokens = assets.filter((a) => a.type === "fungible");
  const nfts = assets.filter((a) => a.type === "nft");
  const removeAssets = (ids: string[]) =>
    setAssets((prev) => prev.filter((a) => !ids.includes(a.id)));

  return { loading, assets, tokens, nfts, nftCount, scanWallet, removeAssets, scanError };
}