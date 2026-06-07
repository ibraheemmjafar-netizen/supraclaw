import { useBurnHistory } from '@/hooks/useBurnHistory';
import { format } from 'date-fns';
import { ExternalLink, Flame } from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function History() {
  const { history } = useBurnHistory();

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Burn History</h1>
        <p className="text-muted-foreground text-sm">A permanent record of your incinerated assets and reclaimed SUPRA.</p>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-24 bg-card/30 border border-border/50 rounded-xl border-dashed">
          <Flame className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-20" />
          <h3 className="text-lg font-medium text-foreground mb-1">No burns yet</h3>
          <p className="text-muted-foreground text-sm">Your incineration history will appear here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-900">
              <TableRow className="border-border hover:bg-zinc-900">
                <TableHead className="font-mono text-xs uppercase tracking-wider">Date</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Items</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Network</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Net Reclaimed</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Tx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((event) => (
                <TableRow key={event.id} className="border-border hover:bg-zinc-900/50 transition-colors">
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {format(new Date(event.timestamp), 'MMM dd, yyyy HH:mm')}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-sm">{event.items.length} assets</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {event.items.map(i => i.name).join(', ')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-zinc-900 text-zinc-400 border-zinc-800 uppercase text-[10px]">
                      {event.network}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-primary font-medium">+{event.netRebate.toFixed(5)}</span>
                      <span className="text-[10px] text-muted-foreground">Gross: {event.grossRebate.toFixed(5)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <a 
                      href={`https://explorer.supra.com/tx/${event.txHash}?network=${event.network}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center p-2 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
