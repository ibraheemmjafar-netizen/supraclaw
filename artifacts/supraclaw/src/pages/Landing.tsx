import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/contexts/WalletContext';
import { Flame, ScanSearch, CheckSquare, Coins } from 'lucide-react';
import { motion } from 'framer-motion';

export function Landing() {
  const [, setLocation] = useLocation();
  const { connected, connect, isStarKeyInstalled } = useWallet();

  useEffect(() => {
    if (connected) {
      setLocation('/app');
    }
  }, [connected, setLocation]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center container mx-auto px-4 py-16 max-w-4xl relative">
      {/* Decorative background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center z-10 space-y-6"
      >
        <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-2xl mb-4 border border-primary/20">
          <Flame className="w-16 h-16 text-primary" />
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter">
          Incinerate. <span className="text-primary">Reclaim.</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Destroy unwanted tokens and NFTs. Claw back your SUPRA storage rent. Fast, precise, and completely irreversible.
        </p>

        <div className="pt-8">
          <Button 
            size="lg" 
            onClick={connect}
            className="h-14 px-8 text-lg font-bold tracking-wide shadow-[0_0_30px_rgba(234,88,12,0.3)] hover:shadow-[0_0_50px_rgba(234,88,12,0.5)] transition-all bg-primary hover:bg-primary/90"
          >
            <Flame className="w-5 h-5 mr-2" />
            {isStarKeyInstalled ? "CONNECT WALLET" : "INSTALL STARKEY TO BEGIN"}
          </Button>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="grid md:grid-cols-3 gap-8 w-full mt-24 z-10"
      >
        <div className="p-6 rounded-xl bg-card border border-border flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <ScanSearch className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-bold uppercase tracking-wider">1. Scan</h3>
          <p className="text-muted-foreground text-sm">Connect your StarKey wallet to instantly scan for dust tokens and unwanted NFTs.</p>
        </div>

        <div className="p-6 rounded-xl bg-card border border-border flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <CheckSquare className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-bold uppercase tracking-wider">2. Select</h3>
          <p className="text-muted-foreground text-sm">Choose the assets you want to permanently destroy. Review the estimated SUPRA rebate.</p>
        </div>

        <div className="p-6 rounded-xl bg-card border border-border flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Coins className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-bold uppercase tracking-wider">3. Reclaim</h3>
          <p className="text-muted-foreground text-sm">Confirm the burn transaction. The assets are destroyed and SUPRA storage rent is refunded.</p>
        </div>
      </motion.div>
    </div>
  );
}
