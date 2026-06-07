import { useState, useEffect } from 'react';
import { Network } from '@/contexts/WalletContext';

export interface BurnEvent {
  id: string;
  timestamp: number;
  items: { name: string; type: "token" | "nft" }[];
  grossRebate: number;
  devFee: number;
  netRebate: number;
  txHash: string;
  network: Network;
}

export function useBurnHistory() {
  const [history, setHistory] = useState<BurnEvent[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('supraclaw_history');
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const addBurnEvent = (event: Omit<BurnEvent, 'id' | 'timestamp'>) => {
    const newEvent: BurnEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };
    
    setHistory(prev => {
      const updated = [newEvent, ...prev];
      localStorage.setItem('supraclaw_history', JSON.stringify(updated));
      return updated;
    });
  };

  return { history, addBurnEvent };
}
