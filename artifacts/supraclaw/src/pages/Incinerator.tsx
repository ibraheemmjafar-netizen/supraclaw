import { useState, useMemo } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { useSupraRpc } from "@/hooks/useSupraRpc";
import { useBurnHistory } from "@/hooks/useBurnHistory";
import { useOraclePrice } from "@/hooks/useOraclePrice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetCard } from "@/components/AssetCard";
import { BurnActionBar } from "@/components/BurnActionBar";
import { BurnConfirmDialog } from "@/components/BurnConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, Image as ImageIcon, Flame, RefreshCw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  burnAssets,
  calculateFee,
  getExplorerTxUrl,
  INCINERATOR_ADDRESS,
} from "@/lib/supraTransaction";

export function Incinerator() {
  const { connected, network, isStarKeyInstalled } = useWallet();
  const { loading, tokens, nfts, removeAssets, scanWallet } = useSupraRpc();
  const { addBurnEvent } = useBurnHistory();
  const { supraUsd, lastUpdated } = useOraclePrice();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleToggleAsset = (id: string, selected: boolean) => {
    const next = new Set(selectedIds);
    if (selected) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const selectedAssets = useMemo(
    () => [...tokens, ...nfts].filter((a) => selectedIds.has(a.id)),
    [tokens, nfts, selectedIds]
  );

  const totalRebate = useMemo(
    () => selectedAssets.reduce((sum, a) => sum + a.estimatedRebate, 0),
    [selectedAssets]
  );

  /**
   * handleBurn — submits real on-chain transactions via StarKey wallet.
   *
   * For each selected asset it calls either:
   *   incinerator::burn_coin<CoinType>(amount, fee, name)
   *   incinerator::incinerate_object(objectAddr, fee)
   *
   * The 5% dev fee is collected inside the Move module from the user's SUPRA
   * balance as part of the same transaction. Everything is non-custodial.
   */
  const handleBurn = async () => {
    setIsProcessing(true);

    try {
      const { devFee, netAmount } = calculateFee(totalRebate);

      // Warn if contract is not yet deployed
      if (INCINERATOR_ADDRESS.includes("YOUR_DEPLOYED")) {
        // Demo mode: simulate for testing before mainnet deployment
        await new Promise((r) => setTimeout(r, 2000));
        const mockHash = `0x${Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join("")}`;

        addBurnEvent({
          items: selectedAssets.map((a) => ({ name: a.name, type: a.type === "fungible" ? "token" as const : "nft" as const })),
          grossRebate: totalRebate,
          devFee,
          netRebate: netAmount,
          txHash: mockHash,
          network,
        });

        removeAssets(Array.from(selectedIds));
        setSelectedIds(new Set());
        setIsConfirmOpen(false);

        toast.success(
          `[Demo] Simulated burn of ${selectedAssets.length} items. Deploy contract to go live.`,
          { duration: 6000 }
        );
        return;
      }

      // Real on-chain burn via StarKey
      const assetsToburn = selectedAssets.map((a) => ({
        type: a.type,
        coinType: a.coinType,
        objectAddress: a.objectAddress,
        rawBalance: a.rawBalance,
        estimatedRebate: a.estimatedRebate,
      }));

      const { txHash } = await burnAssets(assetsToburn);

      addBurnEvent({
        items: selectedAssets.map((a) => ({ name: a.name, type: a.type === "fungible" ? "token" as const : "nft" as const })),
        grossRebate: totalRebate,
        devFee,
        netRebate: netAmount,
        txHash,
        network,
      });

      removeAssets(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsConfirmOpen(false);

      const explorerUrl = getExplorerTxUrl(txHash, network);
      toast.success(
        `Incinerated ${selectedAssets.length} item${selectedAssets.length !== 1 ? "s" : ""}. Reclaimed ${netAmount.toFixed(5)} SUPRA.`,
        {
          duration: 8000,
          action: {
            label: "View tx",
            onClick: () => window.open(explorerUrl, "_blank"),
          },
        }
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Transaction failed";
      toast.error(`Burn failed: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderSkeletons = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-20 rounded-xl border border-border bg-card/50 flex items-center p-4"
        >
          <Skeleton className="h-5 w-5 rounded-sm mr-4" />
          <Skeleton className="h-10 w-10 rounded-md mr-4" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      ))}
    </div>
  );

  const renderEmpty = (icon: React.ReactNode, label: string) => (
    <div className="text-center py-16 bg-card/30 border border-border/50 rounded-xl border-dashed">
      <div className="mx-auto mb-4 opacity-40">{icon}</div>
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  );

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 pb-36">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Incinerator
          </h1>
          <p className="text-muted-foreground text-sm">
            Select assets to burn and reclaim their SUPRA storage deposits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Live SUPRA price ticker */}
          {supraUsd !== null && (
            <div
              data-testid="stat-supra-price"
              className="hidden sm:flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-md"
            >
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-muted-foreground font-mono">SUPRA</span>
              <span className="text-xs font-mono font-semibold text-white">
                ${supraUsd.toFixed(4)}
              </span>
              {lastUpdated && (
                <span className="text-[10px] text-zinc-600">
                  live
                </span>
              )}
            </div>
          )}

          {!connected && (
            <div
              data-testid="status-preview-mode"
              className="bg-primary/10 border border-primary/20 text-primary px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
            >
              <Flame className="w-4 h-4" />
              Preview Mode
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={scanWallet}
            disabled={loading}
            data-testid="button-refresh-scan"
            className="border-border hover:border-primary/50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Rescan
          </Button>
        </div>
      </div>

      {/* Asset tabs */}
      <Tabs defaultValue="tokens" className="w-full">
        <TabsList className="w-full grid grid-cols-2 h-12 bg-zinc-900 border border-zinc-800 p-1 mb-6">
          <TabsTrigger
            value="tokens"
            data-testid="tab-tokens"
            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white font-medium uppercase tracking-wider text-xs"
          >
            <Coins className="w-4 h-4 mr-2" />
            Tokens ({tokens.length})
          </TabsTrigger>
          <TabsTrigger
            value="nfts"
            data-testid="tab-nfts"
            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white font-medium uppercase tracking-wider text-xs"
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            NFTs ({nfts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="space-y-3 mt-0">
          {loading ? (
            renderSkeletons()
          ) : tokens.length === 0 ? (
            renderEmpty(
              <Coins className="w-12 h-12 mx-auto text-muted-foreground" />,
              "No burnable tokens found in this wallet."
            )
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3"
              >
                {tokens.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    selected={selectedIds.has(asset.id)}
                    onToggle={handleToggleAsset}
                    supraUsdPrice={supraUsd}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </TabsContent>

        <TabsContent value="nfts" className="space-y-3 mt-0">
          {loading ? (
            renderSkeletons()
          ) : nfts.length === 0 ? (
            renderEmpty(
              <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground" />,
              "No burnable NFTs found in this wallet."
            )
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3"
              >
                {nfts.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    selected={selectedIds.has(asset.id)}
                    onToggle={handleToggleAsset}
                    supraUsdPrice={supraUsd}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </TabsContent>
      </Tabs>

      {/* Sticky burn bar */}
      <BurnActionBar
        selectedCount={selectedIds.size}
        totalRebate={totalRebate}
        onBurnClick={() => setIsConfirmOpen(true)}
        supraUsdPrice={supraUsd}
      />

      {/* Confirmation dialog */}
      <BurnConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        selectedAssets={selectedAssets}
        totalRebate={totalRebate}
        onConfirm={handleBurn}
        isProcessing={isProcessing}
        supraUsdPrice={supraUsd}
      />
    </div>
  );
}
