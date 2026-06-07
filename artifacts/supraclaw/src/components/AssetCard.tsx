import { BurnableAsset } from "@/hooks/useSupraRpc";
import { supraToUsd } from "@/hooks/useOraclePrice";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Coins, Image as ImageIcon } from "lucide-react";

interface AssetCardProps {
  asset: BurnableAsset;
  selected: boolean;
  onToggle: (id: string, selected: boolean) => void;
  supraUsdPrice: number | null;
}

export function AssetCard({ asset, selected, onToggle, supraUsdPrice }: AssetCardProps) {
  const usdValue = supraToUsd(asset.estimatedRebate, supraUsdPrice);

  return (
    <Card
      data-testid={`card-asset-${asset.id}`}
      className={`p-4 cursor-pointer transition-all duration-200 border ${
        selected
          ? "border-primary bg-primary/5 shadow-[0_0_15px_rgba(234,88,12,0.15)]"
          : "border-border hover:border-border/80 bg-card hover:bg-card/80"
      }`}
      onClick={() => onToggle(asset.id, !selected)}
    >
      <div className="flex items-center space-x-4">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onToggle(asset.id, checked as boolean)}
          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary shrink-0"
          data-testid={`checkbox-asset-${asset.id}`}
        />

        {/* Icon */}
        <div className="w-10 h-10 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
          {asset.type === "nft" ? (
            <ImageIcon className="w-5 h-5" />
          ) : (
            <Coins className="w-5 h-5" />
          )}
        </div>

        {/* Name + balance */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-foreground truncate">{asset.name}</h3>

            {/* Rebate column */}
            <div className="text-right shrink-0">
              <p
                className="text-sm font-mono text-primary leading-tight"
                data-testid={`text-rebate-${asset.id}`}
              >
                ~{asset.estimatedRebate.toFixed(5)} SUPRA
              </p>
              {usdValue ? (
                <p className="text-[11px] text-muted-foreground font-mono leading-tight">
                  ≈ {usdValue}
                </p>
              ) : (
                <p className="text-[11px] text-zinc-700 font-mono leading-tight">
                  —
                </p>
              )}
            </div>
          </div>

          <div className="mt-1">
            <p className="text-xs text-muted-foreground truncate">
              {asset.type === "nft"
                ? asset.collection
                : `${asset.balance.toLocaleString()} ${asset.symbol ?? asset.name}`}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
