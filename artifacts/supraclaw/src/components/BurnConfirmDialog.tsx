import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Flame, Loader2 } from "lucide-react";
import { BurnableAsset } from "@/hooks/useSupraRpc";
import { supraToUsd } from "@/hooks/useOraclePrice";

interface BurnConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAssets: BurnableAsset[];
  totalRebate: number;
  onConfirm: () => void;
  isProcessing: boolean;
  supraUsdPrice: number | null;
}

export function BurnConfirmDialog({
  open,
  onOpenChange,
  selectedAssets,
  totalRebate,
  onConfirm,
  isProcessing,
  supraUsdPrice,
}: BurnConfirmDialogProps) {
  const devFee = totalRebate * 0.05;
  const netRebate = totalRebate - devFee;

  const usdGross = supraToUsd(totalRebate, supraUsdPrice);
  const usdFee = supraToUsd(devFee, supraUsdPrice);
  const usdNet = supraToUsd(netRebate, supraUsdPrice);

  return (
    <Dialog open={open} onOpenChange={isProcessing ? undefined : onOpenChange}>
      <DialogContent
        className="sm:max-w-md bg-zinc-950 border-zinc-800"
        data-testid="dialog-burn-confirm"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="w-5 h-5" />
            <DialogTitle className="text-destructive font-bold uppercase tracking-wider">
              Irreversible Action
            </DialogTitle>
          </div>
          <DialogDescription className="text-zinc-400">
            You are about to permanently destroy{" "}
            <span className="text-white font-medium">
              {selectedAssets.length} asset{selectedAssets.length !== 1 ? "s" : ""}
            </span>{" "}
            on the Supra network. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {/* Asset list (max 5 shown) */}
        {selectedAssets.length > 0 && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
            {selectedAssets.slice(0, 5).map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between text-xs text-zinc-400 font-mono"
              >
                <span className="truncate mr-2">{a.name}</span>
                <span className="text-zinc-600 shrink-0">
                  {a.type === "fungible" ? "TOKEN" : "NFT"}
                </span>
              </div>
            ))}
            {selectedAssets.length > 5 && (
              <p className="text-[11px] text-zinc-600 text-center pt-1">
                + {selectedAssets.length - 5} more
              </p>
            )}
          </div>
        )}

        {/* Fee breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 font-mono text-sm">
          <div className="flex justify-between items-center text-zinc-400">
            <span>Gross Rebate</span>
            <div className="text-right">
              <p>{totalRebate.toFixed(5)} SUPRA</p>
              {usdGross && (
                <p className="text-[11px] text-zinc-600">{usdGross}</p>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center text-zinc-500">
            <span>Dev Fee (5%)</span>
            <div className="text-right">
              <p className="text-destructive/80">−{devFee.toFixed(5)} SUPRA</p>
              {usdFee && (
                <p className="text-[11px] text-zinc-600">{usdFee}</p>
              )}
            </div>
          </div>

          <div className="h-px bg-zinc-800 w-full" />

          <div className="flex justify-between items-center">
            <span className="text-white font-semibold">You Receive</span>
            <div className="text-right">
              <p
                className="text-primary font-bold text-base"
                data-testid="text-net-return-confirm"
              >
                +{netRebate.toFixed(5)} SUPRA
              </p>
              {usdNet && (
                <p className="text-[11px] text-zinc-400 font-semibold">{usdNet}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            data-testid="button-cancel-burn"
            className="border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            data-testid="button-confirm-burn"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[0_0_15px_rgba(234,88,12,0.4)] hover:shadow-[0_0_25px_rgba(234,88,12,0.6)] min-w-[160px] uppercase tracking-wider w-full sm:w-auto"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Incinerating…
              </>
            ) : (
              <>
                <Flame className="w-4 h-4 mr-2" />
                Confirm & Burn
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
