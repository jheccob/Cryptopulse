import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { type Signal } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface SignalCardProps {
  signal: Signal;
}

export function SignalCard({ signal }: SignalCardProps) {
  const isBuy = signal.type === 'BUY';
  
  const timeAgo = formatDistanceToNow(new Date(signal.timestamp), { 
    addSuffix: true 
  });

  return (
    <Card className="bg-trading-bg border-trading-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-2 h-2 rounded-full ${
              isBuy ? 'bg-trading-success' : 'bg-trading-danger'
            }`} />
            <div>
              <div className="flex items-center space-x-2">
                {isBuy ? (
                  <TrendingUp className="w-4 h-4 text-trading-success" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-trading-danger" />
                )}
                <Badge 
                  variant={isBuy ? "default" : "destructive"}
                  className={`text-xs font-medium ${
                    isBuy ? 'bg-trading-success/20 text-trading-success' : 'bg-trading-danger/20 text-trading-danger'
                  }`}
                >
                  {signal.type} SIGNAL
                </Badge>
              </div>
              <div className="text-xs text-trading-text-secondary mt-1">
                {timeAgo}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono text-trading-text">
              ${signal.price.toFixed(5)}
            </div>
            <div className="text-xs text-trading-text-secondary">
              RSI: {signal.rsi.toFixed(1)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
