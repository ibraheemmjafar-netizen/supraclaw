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

const MOCK_TOKENS: BurnableAsset[] = [
  { id: "mock-1", name: "SUPRA OG", symbol: "OG", balance: 8023, rawBalance: "8023", decimals: 6, estimatedRebate: 0.001, type: "fungible", collection: "", coinType: "0xd0f37da5c7a0104d8cb161e1ac1e101f90b702c18081b76b62f20137bf40fd0b::OG::OG", objectAddress: "" },
  { id: "mock-2", name: "LEO", symbol: "LEO", balance: 5000, rawBalance: "5000000000", decimals: 6, estimatedRebate: 0.001, type: "fungible", collection: "", coinType: "0x83e6ebf0e08121734b117daf65677c77185e151114364f7c53bc2366f2c64a12::LEO::LEO", objectAddress: "" },
  { id: "mock-3", name: "DAWGZ", symbol: "DAWGZ", balance: 420, rawBalance: "420000000", decimals: 6, estimatedRebate: 0.001, type: "fungible", collection: "", coinType: "0xb8e94e7204d8eeb565a653d262ae6f7434a3a452e2aaf624810b33dfa3b64d09::DAWGZ::DAWGZ", objectAddress: "" },
];

const MOCK_NFTS: BurnableAsset[] = [
  { id: "mock-nft-1", name: "Crystara #4201", symbol: "NFT", balance: 1, rawBalance: "1", decimals: 0, estimatedRebate: 0.005, type: "nft", collection: "Crystara Genesis", coinType: "", objectAddress: "0xCRYSTARA0004201" },
];

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
      const resources = await fetchAccountResources(address, network);
      console.log(`[supraclaw] ${resources.length} resources for ${address}`);

      const coinStores = getCoinStoreResources(resources);
      console.log(`[supraclaw] ${coinStores.length} CoinStore resources`);

      const fungibleResults = await Promise.all(
        coinStores.map(async (r, i): Promise<BurnableAsset | null> => {
          const coinType = extractCoinType(r);
          if (!coinType) return null;

          const [balance, name, symbol, decimals] = await Promise.all([
            fetchCoinBalance(coinType, address, network),
            fetchCoinName(coinType, network),
            fetchCoinSymbol(coinType, network),
            fetchCoinDecimals(coinType, network),
          ]);

          if (balance === 0) return null;

          const asset: BurnableAsset = {
            id: `coin-${i}-${coinType}`,
            name,
            symbol,
            balance: balance / Math.pow(10, decimals),
            rawBalance: balance.toString(),
            decimals,
            estimatedRebate: 0.001,
            type: "fungible",
            collection: "",
            coinType,
            objectAddress: "",
          };
          return asset;
        })
      );

      const fungibles = fungibleResults.filter((x): x is BurnableAsset => x !== null);
      console.log(`[supraclaw] ${fungibles.length} non-zero tokens`);

      const nfts: BurnableAsset[] = [];
      if (hasTokenStore(resources)) {
        const nftEvents = await fetchV1NftDepositEvents(address, network, 100);
        const seen = new Set<string>();
        nftEvents.forEach((ev, i) => {
          const key = `${ev.collection}::${ev.name}::${ev.propertyVersion}`;
          if (seen.has(key)) return;
          seen.add(key);
          const nft: BurnableAsset = {
            id: `nft-${i}-${key}`,
            name: ev.name,
            symbol: "NFT",
            balance: 1,
            rawBalance: "1",
            decimals: 0,
            estimatedRebate: 0.004,
            type: "nft",
            collection: ev.collection,
            coinType: "",
            objectAddress: `${ev.creator}::${ev.collection}::${ev.name}`,
          };
          nfts.push(nft);
        });
        console.log(`[supraclaw] ${nfts.length} v1 NFTs`);
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