import { useWallet, Network } from '@/contexts/WalletContext';

export function NetworkSwitcher() {
  const { network, setNetwork } = useWallet();

  return (
    <div className="flex bg-zinc-900 border border-zinc-800 rounded-full p-1 h-9">
      {(['mainnet', 'testnet'] as Network[]).map((net) => (
        <button
          key={net}
          onClick={() => setNetwork(net)}
          className={`px-3 text-xs font-medium uppercase tracking-wider rounded-full transition-all ${
            network === net 
              ? 'bg-zinc-800 text-white shadow-sm' 
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {net}
        </button>
      ))}
    </div>
  );
}
