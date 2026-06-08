/**
 * useSupraRpc.ts
 * Scans connected wallet for all burnable assets via Supra REST API.
 * Detects: legacy CoinStore tokens, FA tokens, and v1 NFTs (TokenStore events).
 */

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchAccountResources,
  fetchTokenEvents,
  parseCoinResources,
  parseFaResources,
  resolveFaMetadata,
  parseTokenStore,
  OCTAS_PER_SUPRA,
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

// ─── Mock data (preview/demo mode) ───────────────────────────────────────────

const MOCK_TOKENS: BurnableAsset[] = [
  { id: "mock-1", name: "PEPE", symbol: "PEPE", balance: 420000, rawBalance: "420000000000", decimals: 6, estimatedRebate: 0.00234, type: "fungible", coinType: "0xATMOS::pepe::PEPE" },
  { id: "mock-2", name: "DOGE", symbol: "DOGE", balance: 1337, rawBalance: "1337000000", decimals: 6, estimatedRebate: 0.00156, type: "fungible", coinType: "0xATMOS::doge::DOGE" },
  { id: "mock-3", name: "WIF",  symbol: "WIF",  balance: 9999, rawBalance: "9999000000", decimals: 6, estimatedRebate: 0.00112, type: "fungible", coinType: "0xATMOS::wif::WIF" },
];

const MOCK_NFTS: BurnableAsset[] = [
  { id: "mock-nft-1", name: "Crystara #4201", collection: "Crystara Genesis", estimatedRebate: 0.00512, type: "nft", balance: 1, rawBalance: "1", decimals: 0, objectAddress: "0xCRYSTARA0004201" },
  { id: "mock-nft-2", name: "Crystara #0042", collection: "Crystara Void",    estimatedRebate: 0.00389, type: "nft", balance: 1, rawBalance: "1", decimals: 0, objectAddress: "0xCRYSTARA0000042" },
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
      await new Promise((r) => setTimeout(r, 800));
      setAssets([...MOCK_TOKENS, ...MOCK_NFTS]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setScanError(null);

    try {
      // ── 1. Fetch all resources on account ──────────────────────────────────
      const resources = await fetchAccountResources(address, network);
      console.log(`[supraclaw] fetched ${resources.length} resources for ${address}`);

      // ── 2. Parse legacy CoinStore tokens ──────────────────────────────────
      const coinResults = parseCoinResources(resources);
      const fungibles: BurnableAsset[] = coinResults.map((c, i) => ({
        id: `coin-${i}-${c.coinType}`,
        name: c.name,
        symbol: c.name,
        balance: c.balance / OCTAS_PER_SUPRA,
        rawBalance: c.rawBalance,
        decimals: 8,
        estimatedRebate: c.estimatedRebate,
        type: "fungible" as const,
        coinType: c.coinType,
      }));

      // ── 3. Parse Fungible Asset (FA) resources ────────────────────────────
      // Atmos tokens use FA standard — these appear as FungibleStore resources
      // if Supra stores them on the account, or we discover them via the API.
      const faRaw = parseFaResources(resources);
      const faTokens: BurnableAsset[] = await Promise.all(
        faRaw.map(async (fa, i) => {
          const meta = await resolveFaMetadata(fa.metadataAddress, network);
          return {
            id: `fa-${i}-${fa.metadataAddress}`,
            name: meta.name,
            symbol: meta.symbol,
            balance: fa.balance / Math.pow(10, meta.decimals),
            rawBalance: fa.rawBalance,
            decimals: meta.decimals,
            estimatedRebate: fa.estimatedRebate,
            type: "fungible" as const,
            coinType: fa.metadataAddress, // FA uses metadata address as identifier
          };
        })
      );

      // ── 4. Parse v1 NFTs from TokenStore deposit events ───────────────────
      // 0x3::token::TokenStore IS a resource directly on the account.
      // We fetch deposit events to discover which tokens are owned.
      const nfts: BurnableAsset[] = [];
      const tokenStoreInfo = parseTokenStore(resources);

      if (tokenStoreInfo) {
        const depositEvents = await fetchTokenEvents(
          address,
          network,
          tokenStoreInfo.depositEventHandle,
          100
        );
        const withdrawEvents = await fetchTokenEvents(
          address,
          network,
          tokenStoreInfo.withdrawEventHandle,
          100
        );

        // Track deposits and subtract withdrawals to find currently owned NFTs
        const depositedIds = new Set<string>();
        const withdrawnIds = new Set<string>();

        interface TokenEvent {
          data?: {
            id?: {
              token_data_id?: {
                creator?: string;
                collection?: string;
                name?: string;
              };
              property_version?: string;
            };
          };
        }

        const tokenId = (event: TokenEvent): string => {
          const d = event?.data?.id?.token_data_id;
          return `${d?.creator ?? ""}::${d?.collection ?? ""}::${d?.name ?? ""}::${event?.data?.id?.property_version ?? "0"}`;
        };

        for (const ev of depositEvents) withdrawnIds.delete(tokenId(ev as TokenEvent)) || depositedIds.add(tokenId(ev as TokenEvent));
        for (const ev of withdrawEvents) withdrawnIds.add(tokenId(ev as TokenEvent));

        let nftIdx = 0;
        for (const ev of depositEvents) {
          const id = tokenId(ev as TokenEvent);
          if (withdrawnIds.has(id)) continue;
          if (!depositedIds.has(id)) continue;
          depositedIds.delete(id); // deduplicate

          const d = (ev as TokenEvent)?.data?.id?.token_data_id;
          nfts.push({
            id: `nft-event-${nftIdx++}`,
            name: d?.name ?? "Unknown NFT",
            collection: d?.collection ?? "Unknown Collection",
            estimatedRebate: 0.004,
            type: "nft",
            balance: 1,
            rawBalance: "1",
            decimals: 0,
            // Object address not directly available from v1 token events;
            // use creator+collection+name as a composite key for the burn payload
            objectAddress: `${d?.creator ?? ""}::${d?.collection ?? ""}::${d?.name ?? ""}`,
          });
        }
      }

      const all = [...fungibles, ...faTokens, ...nfts];
      console.log(`[supraclaw] found ${fungibles.length} legacy coins, ${faTokens.length} FA tokens, ${nfts.length} NFTs`);
      setAssets(all);

      if (all.length === 0) {
        setScanError("No burnable assets found. This wallet may hold assets in a format not yet supported (e.g. v2 digital assets require the Supra indexer).");
      }
    } catch (err) {
      console.error("[supraclaw] scan failed:", err);
      setScanError(err instanceof Error ? err.message : "Scan failed");
      // Don't fall back to mock — show empty with error so user knows
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