import { Button } from "@/components/ui/button";
import { Flame, TrendingUp } from "lucide-react";
import { supraToUsd } from "@/hooks/useOraclePrice";

interface BurnActionBarProps {
  selectedCount: number;
  totalRebate: number;
  onBurnClick: () => void;
  supraUsdPrice: number | null;
}

export function BurnActionBar({
  selectedCount,
  totalRebate,
  onBurnClick,
  supraUsdPrice,
}: BurnActionBarProps) {
  if (selectedCount === 0) return null;

  const devFee = totalRebate * 0.05;
  const netRebate = totalRebate - devFee;
  const usdNet = supraToUsd(netRebate, supraUsdPrice);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Gradient fade */}
      <div className="h-6 bg-gradient-to-t from-background to-transparent" />

      <div className="bg-background/90 backdrop-blur-xl border-t border-border px-4 py-4">
        <div className="container max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Stats */}
          <div className="flex items-center gap-6 w-full sm:w-auto">
            <div data-testid="stat-selected-count">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">
                Selected
              </p>
              <p className="text-lg font-mono font-semibold">
                {selectedCount} item{selectedCount !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="h-8 w-px bg-border hidden sm:block" />

            <div data-testid="stat-net-return">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">
                Net Return (after 5% fee)
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-mono font-semibold text-primary">
                  +{netRebate.toFixed(5)} SUPRA
                </p>
                {usdNet && (
                  <span className="text-sm text-muted-foreground font-mono flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {usdNet}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Burn button */}
          <Button
            size="lg"
            onClick={onBurnClick}
            data-testid="button-burn-selected"
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-widest shadow-[0_0_20px_rgba(234,88,12,0.3)] hover:shadow-[0_0_35px_rgba(234,88,12,0.55)] transition-all uppercase"
          >
            <Flame className="w-5 h-5 mr-2" />
            Burn Selected
          </Button>
        </div>
      </div>
    </div>
  );
}
