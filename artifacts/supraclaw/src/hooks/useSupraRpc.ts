/**
 * useSupraRpc.ts
 *
 * Scans the connected wallet for burnable assets via the Supra REST API.
 * Falls back to mock data when no wallet is connected (preview/demo mode).
 */

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchAccountResources,
  parseCoinResources,
  getRpcUrl,
  OCTAS_PER_SUPRA,
} from "@/lib/supraTransaction";

// ─── Asset type ───────────────────────────────────────────────────────────────

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
  /** Fully-qualified Move type string, e.g. "0xABC::my_coin::MyCoin" */
  coinType?: string;
  /** Object address for NFTs */
  objectAddress?: string;
}

// ─── Mock data (shown when wallet not connected) ──────────────────────────────

const MOCK_TOKENS: BurnableAsset[] = [
  {
    id: "mock-1",
    name: "PEPE",
    symbol: "PEPE",
    balance: 420000,
    rawBalance: "420000000000",
    decimals: 6,
    estimatedRebate: 0.00234,
    type: "fungible",
    coinType: "0xATMOS::pepe::PEPE",
  },
  {
    id: "mock-2",
    name: "DOGE",
    symbol: "DOGE",
    balance: 1337,
    rawBalance: "1337000000",
    decimals: 6,
    estimatedRebate: 0.00156,
    type: "fungible",
    coinType: "0xATMOS::doge::DOGE",
  },
  {
    id: "mock-3",
    name: "MOON",
    symbol: "MOON",
    balance: 69,
    rawBalance: "6900",
    decimals: 2,
    estimatedRebate: 0.00089,
    type: "fungible",
    coinType: "0xATMOS::moon::MOON",
  },
  {
    id: "mock-4",
    name: "WIF",
    symbol: "WIF",
    balance: 9999,
    rawBalance: "9999000000",
    decimals: 6,
    estimatedRebate: 0.00112,
    type: "fungible",
    coinType: "0xATMOS::wif::WIF",
  },
];

const MOCK_NFTS: BurnableAsset[] = [
  {
    id: "mock-nft-1",
    name: "Crystara #4201",
    collection: "Crystara Genesis",
    estimatedRebate: 0.00512,
    type: "nft",
    balance: 1,
    rawBalance: "1",
    decimals: 0,
    objectAddress: "0xCRYSTARA0000000000000000000000000000000000000000000000000004201",
  },
  {
    id: "mock-nft-2",
    name: "Crystara #0042",
    collection: "Crystara Void",
    estimatedRebate: 0.00389,
    type: "nft",
    balance: 1,
    rawBalance: "1",
    decimals: 0,
    objectAddress: "0xCRYSTARA0000000000000000000000000000000000000000000000000000042",
  },
];

// ─── NFT resource patterns ────────────────────────────────────────────────────

const NFT_TYPE_PATTERNS = [
  "0x3::token::",
  "0x4::token::",
  "crystara",
  "::nft::",
  "::digital_asset::",
  "TokenStore",
];

function looksLikeNftType(type: string): boolean {
  const lower = type.toLowerCase();
  return NFT_TYPE_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSupraRpc() {
  const { address, network, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<BurnableAsset[]>([]);

  const scanWallet = useCallback(async () => {
    if (!connected || !address) {
      // Show mock data in preview/demo mode
      setLoading(true);
      await new Promise((r) => setTimeout(r, 1200));
      setAssets([...MOCK_TOKENS, ...MOCK_NFTS]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const resources = await fetchAccountResources(address, network);

      const fungibles: BurnableAsset[] = parseCoinResources(resources).map(
        (c, i) => ({
          id: `coin-${i}-${c.coinType}`,
          name: c.name,
          symbol: c.name,
          balance: c.balance / OCTAS_PER_SUPRA,
          rawBalance: c.rawBalance,
          decimals: 8,
          estimatedRebate: c.estimatedRebate,
          type: "fungible" as const,
          coinType: c.coinType,
        })
      );

      // Collect NFT resources (token stores, digital assets, etc.)
      const nftResources = (resources as Array<{ type: string; data: unknown }>)
        .filter((r) => looksLikeNftType(r.type))
        .map((r, i) => {
          const parts = r.type.split("::");
          const name = parts[parts.length - 1] ?? r.type;
          const data = r.data as Record<string, unknown>;
          return {
            id: `nft-${i}-${r.type}`,
            name: name.replace(/_/g, " "),
            collection: parts[1] ?? "Unknown Collection",
            estimatedRebate: 0.004,
            type: "nft" as const,
            balance: 1,
            rawBalance: "1",
            decimals: 0,
            objectAddress: (data?.inner as string) ?? address,
          };
        });

      setAssets([...fungibles, ...nftResources]);
    } catch (err) {
      console.error("Failed to scan wallet:", err);
      // On error, fall back to mock data so the UI is never empty
      setAssets([...MOCK_TOKENS, ...MOCK_NFTS]);
    } finally {
      setLoading(false);
    }
  }, [address, network, connected]);

  useEffect(() => {
    scanWallet();
  }, [scanWallet]);

  const tokens = assets.filter((a) => a.type === "fungible");
  const nfts = assets.filter((a) => a.type === "nft");

  const removeAssets = (ids: string[]) => {
    setAssets((prev) => prev.filter((a) => !ids.includes(a.id)));
  };

  return { loading, assets, tokens, nfts, scanWallet, removeAssets };
}
