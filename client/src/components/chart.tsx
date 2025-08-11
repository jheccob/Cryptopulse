import { useEffect, useRef } from 'react';
import { type MarketData } from '@shared/schema';

interface ChartProps {
  data: MarketData[];
  symbol: string;
  timeframe: string;
  className?: string;
}

export function Chart({ data, symbol, timeframe, className }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    // Clear previous content
    containerRef.current.innerHTML = '';

    // Create TradingView widget
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `BINANCE:${symbol.replace('/', '')}`,
      interval: timeframe,
      timezone: "America/Sao_Paulo",
      theme: "dark",
      style: "1",
      locale: "en",
      toolbar_bg: "#1E293B",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: true,
      save_image: false,
      container_id: "tradingview_chart",
      studies: [
        "MACD@tv-basicstudies",
        "RSI@tv-basicstudies"
      ],
      backgroundColor: "#0F172A",
      gridColor: "#334155",
      hide_side_toolbar: false,
      allow_symbol_change: false,
      show_popup_button: false,
      popup_width: "1000",
      popup_height: "650",
      overrides: {
        "paneProperties.background": "#0F172A",
        "paneProperties.backgroundType": "solid",
        "paneProperties.backgroundGradientStartColor": "#0F172A",
        "paneProperties.backgroundGradientEndColor": "#0F172A",
        "scalesProperties.textColor": "#94A3B8",
        "scalesProperties.lineColor": "#475569",
        "symbolWatermarkProperties.transparency": 90,
        "volumePaneSize": "medium"
      }
    });

    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'tradingview_chart';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';
    
    containerRef.current.appendChild(widgetContainer);
    containerRef.current.appendChild(script);

  }, [data, symbol, timeframe]);

  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading chart data...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className} style={{ height: '100%', width: '100%' }} />
  );
}
