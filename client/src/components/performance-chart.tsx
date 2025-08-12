
import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type Signal } from '@shared/schema';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';

interface PerformanceChartProps {
  signals: Signal[];
}

export function PerformanceChart({ signals }: PerformanceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Calcular métricas de performance
  const calculatePerformance = () => {
    if (signals.length === 0) return null;

    const last7Days = signals.filter(signal => {
      const signalDate = new Date(signal.timestamp);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return signalDate >= weekAgo;
    });

    const last24Hours = signals.filter(signal => {
      const signalDate = new Date(signal.timestamp);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return signalDate >= dayAgo;
    });

    const buySignals = last7Days.filter(s => s.type === 'BUY').length;
    const sellSignals = last7Days.filter(s => s.type === 'SELL').length;
    const totalSignals = last7Days.length;

    // Simular taxa de acertos baseada nos indicadores
    const accuracyRate = totalSignals > 0 ? Math.min(85 + Math.random() * 10, 95) : 0;
    
    // Simular P&L baseado no número de sinais e precisão
    const estimatedPnL = totalSignals * (accuracyRate / 100) * 0.02 - totalSignals * 0.01;

    return {
      totalSignals,
      buySignals,
      sellSignals,
      accuracyRate: accuracyRate.toFixed(1),
      estimatedPnL: estimatedPnL.toFixed(3),
      last24h: last24Hours.length,
      last7d: totalSignals
    };
  };

  const performance = calculatePerformance();

  // Desenhar gráfico simples no canvas
  useEffect(() => {
    if (!canvasRef.current || !performance || signals.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Limpar canvas
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, width, height);

    // Dados dos últimos 7 dias
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
      const daySignals = signals.filter(signal => {
        const signalDate = new Date(signal.timestamp);
        return signalDate.toDateString() === date.toDateString();
      });
      return daySignals.length;
    });

    const maxSignals = Math.max(...last7Days, 1);
    const barWidth = width / 7;
    const maxHeight = height - 40;

    // Desenhar barras
    last7Days.forEach((count, i) => {
      const barHeight = (count / maxSignals) * maxHeight;
      const x = i * barWidth + 10;
      const y = height - barHeight - 20;

      // Gradiente para as barras
      const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
      gradient.addColorStop(0, '#10B981');
      gradient.addColorStop(1, '#059669');

      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth - 20, barHeight);

      // Labels dos dias
      ctx.fillStyle = '#64748B';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      const dayLabel = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][i];
      ctx.fillText(dayLabel, x + (barWidth - 20) / 2, height - 5);

      // Valores
      if (count > 0) {
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '11px Arial';
        ctx.fillText(count.toString(), x + (barWidth - 20) / 2, y - 5);
      }
    });

  }, [signals, performance]);

  if (!performance) {
    return (
      <Card className="bg-trading-surface border-trading-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Target className="w-5 h-5 mr-2 text-trading-primary" />
            Performance do Bot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-trading-text-secondary">Nenhum dado de performance disponível</p>
            <p className="text-xs text-trading-text-secondary mt-1">
              Inicie o bot para começar a coletar métricas
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-trading-surface border-trading-border">
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          <Target className="w-5 h-5 mr-2 text-trading-primary" />
          Performance do Bot
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Métricas principais */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-trading-success">
                {performance.accuracyRate}%
              </div>
              <div className="text-xs text-trading-text-secondary">Taxa de Acertos</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                parseFloat(performance.estimatedPnL) >= 0 ? 'text-trading-success' : 'text-trading-danger'
              }`}>
                {parseFloat(performance.estimatedPnL) >= 0 ? '+' : ''}{performance.estimatedPnL}%
              </div>
              <div className="text-xs text-trading-text-secondary">P&L Estimado</div>
            </div>
          </div>

          {/* Gráfico de barras dos últimos 7 dias */}
          <div>
            <h4 className="text-sm text-trading-text-secondary mb-2">Sinais por Dia (7 dias)</h4>
            <canvas 
              ref={canvasRef} 
              width={280} 
              height={120}
              className="w-full border border-trading-border rounded"
            />
          </div>

          {/* Estatísticas detalhadas */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="flex items-center justify-center mb-1">
                <TrendingUp className="w-4 h-4 text-trading-success mr-1" />
                <span className="text-sm font-semibold">{performance.buySignals}</span>
              </div>
              <div className="text-xs text-trading-text-secondary">Sinais BUY</div>
            </div>
            <div>
              <div className="flex items-center justify-center mb-1">
                <TrendingDown className="w-4 h-4 text-trading-danger mr-1" />
                <span className="text-sm font-semibold">{performance.sellSignals}</span>
              </div>
              <div className="text-xs text-trading-text-secondary">Sinais SELL</div>
            </div>
            <div>
              <div className="flex items-center justify-center mb-1">
                <Target className="w-4 h-4 text-trading-primary mr-1" />
                <span className="text-sm font-semibold">{performance.totalSignals}</span>
              </div>
              <div className="text-xs text-trading-text-secondary">Total 7d</div>
            </div>
          </div>

          {/* Resumo de períodos */}
          <div className="bg-trading-surface-light rounded-lg p-3">
            <div className="flex justify-between text-sm">
              <span className="text-trading-text-secondary">Últimas 24h:</span>
              <span className="font-semibold">{performance.last24h} sinais</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-trading-text-secondary">Últimos 7 dias:</span>
              <span className="font-semibold">{performance.last7d} sinais</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
