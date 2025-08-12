
import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { type BotStatus } from '@shared/schema';
import { Activity, Wifi, WifiOff, Clock } from 'lucide-react';

interface UptimeChartProps {
  botStatus: BotStatus | undefined;
  isConnected: boolean;
}

export function UptimeChart({ botStatus, isConnected }: UptimeChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Simular dados de uptime dos últimos 24 períodos (horas)
  const generateUptimeData = () => {
    const data = [];
    const now = new Date();
    
    for (let i = 23; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      // Simular uptime baseado no status atual
      const isUp = botStatus?.isRunning ? Math.random() > 0.1 : Math.random() > 0.8;
      data.push({
        time,
        status: isUp ? 'up' : 'down',
        hour: time.getHours()
      });
    }
    return data;
  };

  const uptimeData = generateUptimeData();
  const uptimePercentage = (uptimeData.filter(d => d.status === 'up').length / uptimeData.length * 100).toFixed(1);

  // Calcular latência simulada
  const getLatency = () => {
    if (!isConnected) return 0;
    return Math.floor(Math.random() * 50) + 20; // Simular latência entre 20-70ms
  };

  const latency = getLatency();

  // Desenhar gráfico de uptime
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Limpar canvas
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, width, height);

    const blockWidth = width / 24;
    const blockHeight = height - 30;

    // Desenhar blocos de status
    uptimeData.forEach((data, i) => {
      const x = i * blockWidth + 2;
      const y = 5;
      
      ctx.fillStyle = data.status === 'up' ? '#10B981' : '#EF4444';
      ctx.fillRect(x, y, blockWidth - 4, blockHeight);

      // Labels das horas (a cada 4 horas)
      if (i % 4 === 0) {
        ctx.fillStyle = '#64748B';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          data.hour.toString().padStart(2, '0') + 'h',
          x + (blockWidth - 4) / 2,
          height - 5
        );
      }
    });

    // Legenda
    ctx.fillStyle = '#10B981';
    ctx.fillRect(width - 80, height - 20, 10, 10);
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Online', width - 65, height - 12);

    ctx.fillStyle = '#EF4444';
    ctx.fillRect(width - 80, height - 35, 10, 10);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText('Offline', width - 65, height - 27);

  }, [uptimeData]);

  return (
    <Card className="bg-trading-surface border-trading-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center">
            <Activity className="w-5 h-5 mr-2 text-trading-primary" />
            Status & Uptime
          </CardTitle>
          <Badge className={`${
            botStatus?.isRunning 
              ? 'bg-trading-success/20 text-trading-success' 
              : 'bg-trading-danger/20 text-trading-danger'
          }`}>
            {botStatus?.isRunning ? 'Ativo' : 'Parado'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Métricas principais */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-trading-primary">
                {uptimePercentage}%
              </div>
              <div className="text-xs text-trading-text-secondary">Uptime 24h</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                latency > 0 ? 'text-trading-success' : 'text-trading-text-secondary'
              }`}>
                {latency}ms
              </div>
              <div className="text-xs text-trading-text-secondary">Latência</div>
            </div>
          </div>

          {/* Gráfico de uptime das últimas 24h */}
          <div>
            <h4 className="text-sm text-trading-text-secondary mb-2">Status das Últimas 24h</h4>
            <canvas 
              ref={canvasRef} 
              width={280} 
              height={60}
              className="w-full border border-trading-border rounded"
            />
          </div>

          {/* Status detalhado */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-trading-success animate-pulse' : 'bg-trading-danger'
                }`} />
                <span className="text-sm text-trading-text-secondary">Conexão WebSocket</span>
              </div>
              <span className={`text-sm ${
                isConnected ? 'text-trading-success' : 'text-trading-danger'
              }`}>
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  botStatus?.connectionStatus?.binance ? 'bg-trading-success' : 'bg-trading-danger'
                }`} />
                <span className="text-sm text-trading-text-secondary">Exchange (Coinbase)</span>
              </div>
              <span className={`text-sm ${
                botStatus?.connectionStatus?.binance ? 'text-trading-success' : 'text-trading-danger'
              }`}>
                {botStatus?.connectionStatus?.binance ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  botStatus?.connectionStatus?.telegram ? 'bg-trading-success' : 'bg-trading-warning'
                }`} />
                <span className="text-sm text-trading-text-secondary">Telegram Bot</span>
              </div>
              <span className={`text-sm ${
                botStatus?.connectionStatus?.telegram ? 'text-trading-success' : 'text-trading-warning'
              }`}>
                {botStatus?.connectionStatus?.telegram ? 'Configurado' : 'Não Configurado'}
              </span>
            </div>
          </div>

          {/* Informações de tempo */}
          <div className="bg-trading-surface-light rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-4 h-4 text-trading-primary" />
              <span className="text-sm font-medium">Informações de Tempo</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-trading-text-secondary">Uptime Atual:</span>
                <span className="font-semibold">{botStatus?.uptime || '0h 0m'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-trading-text-secondary">Último Sinal:</span>
                <span className="font-semibold">
                  {botStatus?.lastSignal ? 'Recente' : 'Nenhum'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-trading-text-secondary">Freq. Atualização:</span>
                <span className="font-semibold">30s</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
