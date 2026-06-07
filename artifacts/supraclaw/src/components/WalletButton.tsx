import { useWallet } from '@/contexts/WalletContext';
import { Button } from '@/components/ui/button';
import { LogOut, Wallet } from 'lucide-react';

export function WalletButton() {
  const { connected, address, connect, disconnect, isStarKeyInstalled } = useWallet();

  if (!connected) {
    return (
      <Button 
        onClick={connect} 
        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold tracking-wide uppercase text-xs"
      >
        <Wallet className="w-4 h-4 mr-2" />
        {isStarKeyInstalled ? "Connect Wallet" : "Install StarKey"}
      </Button>
    );
  }

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

  return (
    <Button 
      variant="outline" 
      onClick={disconnect}
      className="border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors font-mono text-sm"
      title="Disconnect"
    >
      {shortAddress}
      <LogOut className="w-4 h-4 ml-2 opacity-50" />
    </Button>
  );
}
