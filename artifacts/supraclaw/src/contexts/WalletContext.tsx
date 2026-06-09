import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Network = "mainnet" | "testnet";

interface WalletContextState {
  connected: boolean;
  address: string | null;
  network: Network;
  balance: number | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  setNetwork: (network: Network) => void;
  isStarKeyInstalled: boolean;
}

const WalletContext = createContext<WalletContextState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<Network>("mainnet");
  const [balance, setBalance] = useState<number | null>(null);
  const [isStarKeyInstalled, setIsStarKeyInstalled] = useState(
    typeof window !== "undefined" && !!(window as any).starkey?.supra
  );

  // Browser extensions inject asynchronously — recheck after mount
  useEffect(() => {
    const check = () => {
      if ((window as any).starkey?.supra) setIsStarKeyInstalled(true);
    };
    check();
    const t1 = setTimeout(check, 500);
    const t2 = setTimeout(check, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (!isStarKeyInstalled) return;

    const starkey = (window as any).starkey;

    const handleAccountChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setConnected(true);
      } else {
        setAddress(null);
        setConnected(false);
      }
    };

    starkey.supra.on("accountChanged", handleAccountChanged);
    starkey.supra.on("networkChanged", (net: string) => {
      setNetwork(net.toLowerCase().includes("test") ? "testnet" : "mainnet");
    });

    starkey.supra.account().then((accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
        setConnected(true);
      }
    }).catch(console.error);

    return () => {
      // Cleanup listeners if possible
    };
  }, [isStarKeyInstalled]);

  const connect = async () => {
    if (!isStarKeyInstalled) {
      window.open("https://starkey.app/", "_blank");
      return;
    }

    try {
      const starkey = (window as any).starkey;
      const accounts = await starkey.supra.connect();
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
        setConnected(true);
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      throw error;
    }
  };

  const disconnect = () => {
    if (!isStarKeyInstalled) return;
    try {
      const starkey = (window as any).starkey;
      if (starkey.supra.disconnect) starkey.supra.disconnect();
      setAddress(null);
      setConnected(false);
      setBalance(null);
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        connected,
        address,
        network,
        balance,
        connect,
        disconnect,
        setNetwork,
        isStarKeyInstalled,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}