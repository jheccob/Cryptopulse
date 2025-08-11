import { storage } from '../storage';
import { type InsertMarketData } from '@shared/schema';

interface TechnicalIndicators {
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
}

export class DemoMarketDataService {
  private isRunning = false;
  private basePrice = 0.11583; // Starting XLM price
  private priceHistory: number[] = [];

  constructor() {
    // Initialize with some historical prices
    this.initializePriceHistory();
  }

  private initializePriceHistory() {
    const basePrice = this.basePrice;
    // Generate 100 data points of realistic price movement
    for (let i = 0; i < 100; i++) {
      const volatility = 0.002; // 0.2% volatility
      const trend = Math.sin(i * 0.1) * 0.0005; // Small trend component
      const random = (Math.random() - 0.5) * volatility;
      const price = basePrice * (1 + trend + random);
      this.priceHistory.push(price);
    }
  }

  async start() {
    this.isRunning = true;
    console.log('Demo market data service started');
  }

  stop() {
    this.isRunning = false;
    console.log('Demo market data service stopped');
  }

  private generateNewPrice(): number {
    const lastPrice = this.priceHistory[this.priceHistory.length - 1];
    const volatility = 0.001; // 0.1% volatility per update
    const random = (Math.random() - 0.5) * volatility;
    const newPrice = lastPrice * (1 + random);
    
    this.priceHistory.push(newPrice);
    
    // Keep only last 100 prices
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }
    
    return newPrice;
  }

  private calculateSMA(values: number[], period: number): number[] {
    const sma: number[] = [];
    
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) {
        sma.push(NaN);
      } else {
        const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        sma.push(sum / period);
      }
    }
    
    return sma;
  }

  private calculateEMA(values: number[], period: number): number[] {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    for (let i = 0; i < values.length; i++) {
      if (i === 0) {
        ema.push(values[i]);
      } else {
        ema.push((values[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
      }
    }
    
    return ema;
  }

  private calculateRSI(values: number[], period = 14): number[] {
    const rsi: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (let i = 1; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    for (let i = 0; i < gains.length; i++) {
      if (i < period - 1) {
        rsi.push(NaN);
      } else {
        const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        
        if (avgLoss === 0) {
          rsi.push(100);
        } else {
          const rs = avgGain / avgLoss;
          rsi.push(100 - (100 / (1 + rs)));
        }
      }
    }
    
    // Add NaN for the first value since we start from index 1
    return [NaN, ...rsi];
  }

  private calculateMACD(values: number[], fastPeriod = 8, slowPeriod = 17, signalPeriod = 9): {
    macd: number[];
    signal: number[];
    histogram: number[];
  } {
    const fastEMA = this.calculateEMA(values, fastPeriod);
    const slowEMA = this.calculateEMA(values, slowPeriod);
    
    const macd = fastEMA.map((fast, i) => fast - slowEMA[i]);
    const signal = this.calculateEMA(macd.filter(v => !isNaN(v)), signalPeriod);
    
    // Pad signal array to match macd length
    const paddedSignal = [...Array(macd.length - signal.length).fill(NaN), ...signal];
    
    const histogram = macd.map((m, i) => m - paddedSignal[i]);
    
    return { macd, signal: paddedSignal, histogram };
  }

  private calculateTechnicalIndicators(
    closes: number[], 
    config: {
      macdFast: number;
      macdSlow: number;
      macdSignal: number;
      rsiPeriod: number;
      volumePeriod: number;
    }
  ): TechnicalIndicators {
    const rsiValues = this.calculateRSI(closes, config.rsiPeriod);
    const macdData = this.calculateMACD(closes, config.macdFast, config.macdSlow, config.macdSignal);
    
    // Get the last values
    const lastIndex = closes.length - 1;
    
    return {
      rsi: rsiValues[lastIndex] || 50,
      macd: macdData.macd[lastIndex] || 0,
      macdSignal: macdData.signal[lastIndex] || 0,
      macdHistogram: macdData.histogram[lastIndex] || 0,
    };
  }

  async processMarketData(symbol: string, timeframe: string, config: any): Promise<InsertMarketData[]> {
    try {
      const marketDataArray: InsertMarketData[] = [];
      const now = new Date();
      
      // Generate realistic OHLCV data for the last 100 periods
      for (let i = 99; i >= 0; i--) {
        const periodStart = new Date(now.getTime() - (i * 5 * 60 * 1000)); // 5 minutes back
        
        // Use existing price or generate new one
        const basePrice = this.priceHistory[99 - i] || this.generateNewPrice();
        const volatility = 0.0005;
        
        const open = basePrice;
        const high = open * (1 + Math.random() * volatility);
        const low = open * (1 - Math.random() * volatility);
        const close = low + (Math.random() * (high - low));
        const volume = 50000 + Math.random() * 100000; // Random volume
        
        const marketData: InsertMarketData = {
          symbol,
          timeframe,
          timestamp: periodStart,
          open,
          high,
          low,
          close,
          volume,
          rsi: null, // Will be calculated below
          macd: null,
          macdSignal: null,
          macdHistogram: null,
        };
        
        marketDataArray.push(marketData);
      }
      
      // Calculate indicators for all data points
      const closes = marketDataArray.map(d => d.close);
      const rsiValues = this.calculateRSI(closes, config.rsiPeriod);
      const macdData = this.calculateMACD(closes, config.macdFast, config.macdSlow, config.macdSignal);
      
      // Update market data with indicators
      for (let i = 0; i < marketDataArray.length; i++) {
        marketDataArray[i].rsi = rsiValues[i] || null;
        marketDataArray[i].macd = macdData.macd[i] || null;
        marketDataArray[i].macdSignal = macdData.signal[i] || null;
        marketDataArray[i].macdHistogram = macdData.histogram[i] || null;
      }
      
      return marketDataArray;
    } catch (error) {
      console.error('Error processing demo market data:', error);
      throw error;
    }
  }

  async getLatestData(symbol: string, timeframe: string) {
    try {
      const config = await storage.getActiveConfiguration();
      if (!config) throw new Error('No active configuration found');
      
      const marketDataArray = await this.processMarketData(symbol, timeframe, config);
      await storage.insertMarketData(marketDataArray);
      
      return marketDataArray[marketDataArray.length - 1]; // Return latest
    } catch (error) {
      console.error('Error getting latest demo data:', error);
      throw error;
    }
  }

  async fetchOHLCV(symbol: string, timeframe: string, limit = 100): Promise<any[][]> {
    // Generate realistic OHLCV array format
    const data: any[][] = [];
    const now = Date.now();
    
    for (let i = limit - 1; i >= 0; i--) {
      const timestamp = now - (i * 5 * 60 * 1000); // 5 minutes intervals
      const price = this.priceHistory[this.priceHistory.length - 1 - i] || this.generateNewPrice();
      const volatility = 0.0005;
      
      const open = price;
      const high = open * (1 + Math.random() * volatility);
      const low = open * (1 - Math.random() * volatility);
      const close = low + (Math.random() * (high - low));
      const volume = 50000 + Math.random() * 100000;
      
      data.push([timestamp, open, high, low, close, volume]);
    }
    
    return data;
  }
}

export const demoMarketDataService = new DemoMarketDataService();