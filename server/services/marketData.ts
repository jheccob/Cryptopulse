import * as ccxt from 'ccxt';
import { storage } from '../storage';
import { type InsertMarketData } from '@shared/schema';

interface TechnicalIndicators {
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
}

export class MarketDataService {
  private exchange: ccxt.Exchange;
  private isRunning = false;

  constructor() {
    this.exchange = new ccxt.binance({
      sandbox: false,
      enableRateLimit: true,
    });
  }

  async start() {
    this.isRunning = true;
    console.log('Market data service started');
  }

  stop() {
    this.isRunning = false;
    console.log('Market data service stopped');
  }

  async fetchOHLCV(symbol: string, timeframe: string, limit = 100): Promise<any[][]> {
    try {
      return await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    } catch (error) {
      console.error('Error fetching OHLCV data:', error);
      throw error;
    }
  }

  calculateSMA(values: number[], period: number): number[] {
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

  calculateEMA(values: number[], period: number): number[] {
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

  calculateRSI(values: number[], period = 14): number[] {
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

  calculateMACD(values: number[], fastPeriod = 8, slowPeriod = 17, signalPeriod = 9): {
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

  calculateTechnicalIndicators(
    closes: number[], 
    volumes: number[], 
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
      rsi: rsiValues[lastIndex] || 0,
      macd: macdData.macd[lastIndex] || 0,
      macdSignal: macdData.signal[lastIndex] || 0,
      macdHistogram: macdData.histogram[lastIndex] || 0,
    };
  }

  async processMarketData(symbol: string, timeframe: string, config: any): Promise<InsertMarketData[]> {
    try {
      const ohlcvData = await this.fetchOHLCV(symbol, timeframe, 100);
      const marketDataArray: InsertMarketData[] = [];
      
      // Extract closes and volumes for indicator calculation
      const closes = ohlcvData.map(d => d[4]); // close prices
      const volumes = ohlcvData.map(d => d[5]); // volumes
      
      // Calculate indicators for all data points
      const rsiValues = this.calculateRSI(closes, config.rsiPeriod);
      const macdData = this.calculateMACD(closes, config.macdFast, config.macdSlow, config.macdSignal);
      
      // Process each OHLCV data point
      for (let i = 0; i < ohlcvData.length; i++) {
        const [timestamp, open, high, low, close, volume] = ohlcvData[i];
        
        const marketData: InsertMarketData = {
          symbol,
          timeframe,
          timestamp: new Date(timestamp),
          open,
          high,
          low,
          close,
          volume,
          rsi: rsiValues[i] || null,
          macd: macdData.macd[i] || null,
          macdSignal: macdData.signal[i] || null,
          macdHistogram: macdData.histogram[i] || null,
        };
        
        marketDataArray.push(marketData);
      }
      
      return marketDataArray;
    } catch (error) {
      console.error('Error processing market data:', error);
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
      console.error('Error getting latest data:', error);
      throw error;
    }
  }
}

export const marketDataService = new MarketDataService();
