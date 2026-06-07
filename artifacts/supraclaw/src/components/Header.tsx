import { Link, useLocation } from 'wouter';
import { Flame } from 'lucide-react';
import { WalletButton } from './WalletButton';
import { NetworkSwitcher } from './NetworkSwitcher';

export function Header() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-background/80 border-b border-border">
      <div className="container max-w-6xl mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-primary/10 p-1.5 rounded-lg group-hover:bg-primary/20 transition-colors">
              <Flame className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">supraclaw</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
            <Link 
              href="/app" 
              className={`transition-colors hover:text-foreground ${location === '/app' ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              Incinerator
            </Link>
            <Link 
              href="/history" 
              className={`transition-colors hover:text-foreground ${location === '/history' ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              History
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <NetworkSwitcher />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
