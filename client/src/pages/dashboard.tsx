import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Chart } from '@/components/chart';
import { SignalCard } from '@/components/signal-card';
import { ConfigPanel } from '@/components/config-panel';
import { PerformanceChart } from '@/components/performance-chart';
import { UptimeChart } from '@/components/uptime-chart';
import { useWebSocket } from '@/hooks/use-websocket';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Play, 
  Square, 
  TrendingUp, 
  Activity, 
  Volume2, 
  Settings,
  Wifi,
  WifiOff,
  BarChart3
} from 'lucide-react';
import { 
  type BotStatus, 
  type Signal, 
  type MarketData, 
  type Configuration,
  type WebSocketMessage 
} from '@shared/schema';

export default function Dashboard() {
  const [realTimeData, setRealTimeData] = useState<{
    currentPrice: number;
    rsi: number;
    macd: number;
    macdSignal: number;
    volume: number;
    lastUpdate: Date;
  } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // WebSocket connection
  const { isConnected } = useWebSocket({
    onMessage: (message: WebSocketMessage) => {
      if (message.type === 'BOT_STATUS') {
        queryClient.setQueryData(['/api/bot/status'], message.data);
      } else if (message.type === 'SIGNAL') {
        queryClient.invalidateQueries({ queryKey: ['/api/signals'] });
        toast({
          title: `${message.data.type} Signal`,
          description: `${message.data.symbol} at $${message.data.price.toFixed(5)}`,
          variant: message.data.type === 'BUY' ? "default" : "destructive",
        });
      } else if (message.type === 'MARKET_DATA') {
        setRealTimeData({
          currentPrice: message.data.close,
          rsi: message.data.rsi || 0,
          macd: message.data.macd || 0,
          macdSignal: message.data.macdSignal || 0,
          volume: message.data.volume || 0,
          lastUpdate: new Date(),
        });
      }
    },
  });

  // Queries
  const { data: botStatus } = useQuery<BotStatus>({
    queryKey: ['/api/bot/status'],
    refetchInterval: 30000,
  });

  const { data: config } = useQuery<Configuration>({
    queryKey: ['/api/config'],
  });

  const { data: signals = [] } = useQuery<Signal[]>({
    queryKey: ['/api/signals'],
    refetchInterval: 60000,
  });

  const { data: marketData = [] } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data', config?.symbol, config?.timeframe],
    enabled: !!config,
    refetchInterval: 60000,
  });

  // Real-time data query - TanStack Query v5 syntax
  const { data: realtimeData } = useQuery({
    queryKey: ['/api/realtime', config?.symbol],
    enabled: !!config,
    refetchInterval: 10000, // Update every 10 seconds
  });

  // Update real-time data when query succeeds
  useEffect(() => {
    if (realtimeData) {
      setRealTimeData({
        currentPrice: (realtimeData as any).price,
        rsi: (realtimeData as any).rsi || 0,
        macd: (realtimeData as any).macd || 0,
        macdSignal: (realtimeData as any).macdSignal || 0,
        volume: (realtimeData as any).volume || 0,
        lastUpdate: new Date(),
      });
    }
  }, [realtimeData]);

  // Mutations
  const startBotMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/bot/start'),
    onSuccess: () => {
      toast({
        title: "Bot Started",
        description: "Trading bot is now monitoring the market.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bot/status'] });
    },
    onError: () => {
      toast({
        title: "Failed to Start",
        description: "Could not start the trading bot.",
        variant: "destructive",
      });
    },
  });

  const stopBotMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/bot/stop'),
    onSuccess: () => {
      toast({
        title: "Bot Stopped",
        description: "Trading bot has been stopped.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bot/status'] });
    },
    onError: () => {
      toast({
        title: "Failed to Stop",
        description: "Could not stop the trading bot.",
        variant: "destructive",
      });
    },
  });

  // Calculate performance metrics
  const last24hSignals = signals.filter(signal => {
    const signalTime = new Date(signal.timestamp);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return signalTime >= yesterday;
  });

  const buySignals = last24hSignals.filter(s => s.type === 'BUY').length;
  const sellSignals = last24hSignals.filter(s => s.type === 'SELL').length;

  // Get current price from latest market data or real-time data
  const currentPrice = realTimeData?.currentPrice || marketData[0]?.close || 0;
  const currentRSI = realTimeData?.rsi || marketData[0]?.rsi || 0;
  const currentMACD = realTimeData?.macd || marketData[0]?.macd || 0;
  const currentVolume = realTimeData?.volume || marketData[0]?.volume || 0;

  // Format uptime
  const formatUptime = (uptime: string) => {
    if (!uptime) return '0h 0m';
    return uptime;
  };

  if (!config) {
    return (
      <div className="min-h-screen bg-trading-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-trading-text-secondary">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-trading-bg text-trading-text">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-trading-surface border-r border-trading-border flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-trading-border">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-trading-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">CryptoTrader</h1>
              <p className="text-xs text-trading-text-secondary">Pro Dashboard</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-trading-primary text-white font-medium">
              <BarChart3 className="w-5 h-5" />
              <span>Dashboard</span>
            </div>
          </div>
        </nav>

        {/* Bot Status */}
        <div className="p-4 border-t border-trading-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-trading-text-secondary">Bot Status</span>
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${
                botStatus?.isRunning ? 'bg-trading-success animate-pulse' : 'bg-trading-border'
              }`} />
              <span className={`text-xs ${
                botStatus?.isRunning ? 'text-trading-success' : 'text-trading-text-secondary'
              }`}>
                {botStatus?.isRunning ? 'Active' : 'Stopped'}
              </span>
            </div>
          </div>
          <div className="text-xs text-trading-text-secondary">
            <p>Last Signal: {botStatus?.lastSignal ? 'Recently' : 'None'}</p>
            <p>Uptime: {formatUptime(botStatus?.uptime || '0h 0m')}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-trading-surface border-b border-trading-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Trading Dashboard</h2>
              <p className="text-sm text-trading-text-secondary">
                {new Date().toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  timeZone: 'America/Sao_Paulo'
                })} BRT
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <Wifi className="w-4 h-4 text-trading-success" />
                ) : (
                  <WifiOff className="w-4 h-4 text-trading-danger" />
                )}
                <span className="text-sm text-trading-text-secondary">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              {/* Bot Controls */}
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  onClick={() => botStatus?.isRunning ? stopBotMutation.mutate() : startBotMutation.mutate()}
                  disabled={startBotMutation.isPending || stopBotMutation.isPending}
                  className={`${
                    botStatus?.isRunning 
                      ? 'bg-trading-danger hover:bg-red-600' 
                      : 'bg-trading-success hover:bg-green-600'
                  } text-white`}
                >
                  {botStatus?.isRunning ? (
                    <>
                      <Square className="w-4 h-4 mr-2" />
                      Stop Bot
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Start Bot
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Current Price */}
            <Card className="bg-trading-surface border-trading-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-trading-text-secondary">{config.symbol}</span>
                  <Badge className="bg-trading-success/20 text-trading-success">+2.34%</Badge>
                </div>
                <div className="text-2xl font-bold font-mono">${currentPrice.toFixed(5)}</div>
                <div className="text-xs text-trading-text-secondary mt-1">Last updated: Live</div>
              </CardContent>
            </Card>

            {/* RSI */}
            <Card className="bg-trading-surface border-trading-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-trading-text-secondary">RSI (14)</span>
                  <div className={`w-2 h-2 rounded-full ${
                    currentRSI > 70 ? 'bg-trading-danger' : 
                    currentRSI < 30 ? 'bg-trading-success' : 'bg-trading-warning'
                  }`} />
                </div>
                <div className="text-2xl font-bold font-mono">{currentRSI.toFixed(1)}</div>
                <div className="w-full bg-trading-surface-light rounded-full h-2 mt-2">
                  <div 
                    className={`h-2 rounded-full ${
                      currentRSI > 70 ? 'bg-trading-danger' : 
                      currentRSI < 30 ? 'bg-trading-success' : 'bg-trading-warning'
                    }`}
                    style={{ width: `${Math.min(currentRSI, 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* MACD */}
            <Card className="bg-trading-surface border-trading-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-trading-text-secondary">MACD Signal</span>
                  <Badge className={`${
                    currentMACD > 0 ? 'bg-trading-success/20 text-trading-success' : 'bg-trading-danger/20 text-trading-danger'
                  }`}>
                    {currentMACD > 0 ? 'Bullish' : 'Bearish'}
                  </Badge>
                </div>
                <div className={`text-lg font-bold font-mono ${
                  currentMACD > 0 ? 'text-trading-success' : 'text-trading-danger'
                }`}>
                  {currentMACD > 0 ? '+' : ''}{currentMACD.toFixed(5)}
                </div>
                <div className="text-xs text-trading-text-secondary mt-1">
                  {currentMACD > 0 ? 'Above signal line' : 'Below signal line'}
                </div>
              </CardContent>
            </Card>

            {/* Volume */}
            <Card className="bg-trading-surface border-trading-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-trading-text-secondary">Volume (24h)</span>
                  <TrendingUp className="w-4 h-4 text-trading-success" />
                </div>
                <div className="text-xl font-bold font-mono">
                  {(currentVolume / 1000000).toFixed(2)}M
                </div>
                <div className="text-xs text-trading-text-secondary mt-1">Above average</div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Chart */}
            <div className="lg:col-span-2">
              <Card className="bg-trading-surface border-trading-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Price Chart</CardTitle>
                    <Select value={config.timeframe}>
                      <SelectTrigger className="w-24 bg-trading-surface-light border-trading-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5m">5m</SelectItem>
                        <SelectItem value="15m">15m</SelectItem>
                        <SelectItem value="1h">1h</SelectItem>
                        <SelectItem value="4h">4h</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <Chart 
                    data={marketData}
                    symbol={config.symbol}
                    timeframe={config.timeframe}
                    className="h-80"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Signals Panel */}
            <div className="space-y-6">
              {/* Recent Signals */}
              <Card className="bg-trading-surface border-trading-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Recent Signals</CardTitle>
                    <Button variant="ghost" size="sm" className="text-trading-primary">
                      View All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {signals.slice(0, 3).map((signal) => (
                      <SignalCard key={signal.id} signal={signal} />
                    ))}
                    {signals.length === 0 && (
                      <div className="text-center py-8">
                        <Activity className="w-8 h-8 text-trading-text-secondary mx-auto mb-2" />
                        <p className="text-trading-text-secondary">No signals yet</p>
                        <p className="text-xs text-trading-text-secondary mt-1">
                          Start the bot to begin monitoring
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Performance */}
              <Card className="bg-trading-surface border-trading-border">
                <CardHeader>
                  <CardTitle className="text-lg">Performance (24h)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-trading-text-secondary">Total Signals</span>
                      <span className="text-sm font-semibold">{last24hSignals.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-trading-text-secondary">Buy Signals</span>
                      <span className="text-sm font-semibold text-trading-success">{buySignals}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-trading-text-secondary">Sell Signals</span>
                      <span className="text-sm font-semibold text-trading-danger">{sellSignals}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Settings */}
              <Card className="bg-trading-surface border-trading-border">
                <CardHeader>
                  <CardTitle className="text-lg">Quick Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-trading-text-secondary mb-2">
                        Trading Pair
                      </label>
                      <Select value={config.symbol}>
                        <SelectTrigger className="bg-trading-surface-light border-trading-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="XLM/USDT">XLM/USDT</SelectItem>
                          <SelectItem value="BTC/USDT">BTC/USDT</SelectItem>
                          <SelectItem value="ETH/USDT">ETH/USDT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-trading-text-secondary">Telegram Alerts</span>
                      <Switch checked={config.telegramEnabled} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Analytics Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-trading-text">Analytics & Monitoring</h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Performance Chart */}
              <PerformanceChart signals={signals} />
              
              {/* Uptime Chart */}
              <UptimeChart botStatus={botStatus} isConnected={isConnected} />
            </div>
          </div>

          {/* Configuration Panel */}
          <ConfigPanel config={config} />
        </main>
      </div>
    </div>
  );
}
