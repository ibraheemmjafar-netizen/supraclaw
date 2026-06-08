/**
 * useSupraRpc.ts
 *
 * Scans wallet for burnable tokens and NFTs using Supra RPC v2.
 *
 * Verified flow (2026-06-08):
 *  1. GET /rpc/v2/accounts/{addr}/resources → balance in data.coin.value (no view calls!)
 *  2. Filter CoinStore<> resources, skip zero balances
 *  3. POST /rpc/v1/view for name/symbol/decimals in parallel
 *  4. For NFTs: parse from recent transaction history
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
  hasTokenStore,
  fetchNftsFromTransactions,
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
}

// ─── Mock data (shown when wallet not connected) ──────────────────────────────

const MOCK_TOKENS: BurnableAsset[] = [
  {
    id: "mock-1",
    name: "SUPRA OG",
    symbol: "OG",
    balance: 0.008023,
    rawBalance: "8023",
    decimals: 6,
    estimatedRebate: SUPRA_PER_SLOT,
    type: "fungible",
    collection: "",
    coinType: "0xd0f37da5c7a0104d8cb161e1ac1e101f90b702c18081b76b62f20137bf40fd0b::OG::OG",
    objectAddress: "",
  },
  {
    id: "mock-2",
    name: "DAWGZ",
    symbol: "DAWGZ",
    balance: 131555.432,
    rawBalance: "131555432078",
    decimals: 6,
    estimatedRebate: SUPRA_PER_SLOT,
    type: "fungible",
    collection: "",
    coinType: "0xb8e94e7204d8eeb565a653d262ae6f7434a3a452e2aaf624810b33dfa3b64d09::DAWGZ::DAWGZ",
    objectAddress: "",
  },
  {
    id: "mock-3",
    name: "LUCKY",
    symbol: "LUCKY",
    balance: 57440.809,
    rawBalance: "57440808891",
    decimals: 6,
    estimatedRebate: SUPRA_PER_SLOT,
    type: "fungible",
    collection: "",
    coinType: "0x4205c82380bff5708cd7c59e0043a45890a457a6cdb60c9191d818958fd7ac26::LUCKY::LUCKY",
    objectAddress: "",
  },
];

const MOCK_NFTS: BurnableAsset[] = [
  {
    id: "mock-nft-1",
    name: "TOKEN_1",
    symbol: "NFT",
    balance: 1,
    rawBalance: "1",
    decimals: 0,
    estimatedRebate: 0.004,
    type: "nft",
    collection: "Supra Hero Community Token",
    coinType: "",
    objectAddress: "",
  },
  {
    id: "mock-nft-2",
    name: "TOKEN_258",
    symbol: "NFT",
    balance: 1,
    rawBalance: "1",
    decimals: 0,
    estimatedRebate: 0.004,
    type: "nft",
    collection: "Beyond Infinity",
    coinType: "",
    objectAddress: "",
  },
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
      await new Promise((r) => setTimeout(r, 500));
      setAssets([...MOCK_TOKENS, ...MOCK_NFTS]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setScanError(null);

    try {
      // ── Step 1: fetch all resources via RPC v2 ─────────────────────────────
      const resources = await fetchAccountResources(address, network);
      console.log(`[supraclaw] ${resources.length} resources for ${address}`);

      // ── Step 2: filter non-zero CoinStore resources ────────────────────────
      const coinStores = getCoinStoreResources(resources).filter(
        (r) => getCoinBalance(r) > 0
      );
      console.log(`[supraclaw] ${coinStores.length} non-zero CoinStores`);

      // ── Step 3: fetch coin metadata in parallel ────────────────────────────
      const fungibles: BurnableAsset[] = await Promise.all(
        coinStores.map(async (r, i): Promise<BurnableAsset> => {
          const coinType = extractCoinType(r)!;
          const rawBal = getCoinBalance(r);
          const fallbackSymbol = coinTypeName(coinType);

          // Fetch name/symbol/decimals in parallel; use fallback if view fails
          const meta = await fetchCoinMeta(coinType, network).catch(() => ({
            name: fallbackSymbol,
            symbol: fallbackSymbol,
            decimals: 6,
          }));

          const balance = rawBal / Math.pow(10, meta.decimals);

          return {
            id: `coin-${i}-${coinType}`,
            name: meta.name,
            symbol: meta.symbol,
            balance,
            rawBalance: rawBal.toString(),
            decimals: meta.decimals,
            estimatedRebate: SUPRA_PER_SLOT,
            type: "fungible",
            collection: "",
            coinType,
            objectAddress: "",
          };
        })
      );

      console.log(`[supraclaw] ${fungibles.length} tokens ready`);

      // ── Step 4: NFTs from transaction history ──────────────────────────────
      const nfts: BurnableAsset[] = [];
      if (hasTokenStore(resources)) {
        const nftList = await fetchNftsFromTransactions(address, network, 100);
        nftList.forEach((nft, i) => {
          nfts.push({
            id: `nft-${i}-${nft.collection}-${nft.name}`,
            name: nft.name,
            symbol: "NFT",
            balance: 1,
            rawBalance: "1",
            decimals: 0,
            estimatedRebate: 0.004,
            type: "nft",
            collection: nft.collection,
            coinType: "",
            objectAddress: `${nft.creator}::${nft.collection}::${nft.name}`,
          });
        });
        console.log(`[supraclaw] ${nfts.length} NFTs from tx history`);
      }

      setAssets([...fungibles, ...nfts]);

      if (fungibles.length === 0 && nfts.length === 0) {
        setScanError("No burnable assets found. Your wallet may have no registered token slots.");
      }
    } catch (err) {
      console.error("[supraclaw] scan error:", err);
      setScanError(
        err instanceof Error ? err.message : "Scan failed. Check your connection."
      );
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