import { 
  type Signal, 
  type InsertSignal, 
  type MarketData, 
  type InsertMarketData,
  type Configuration,
  type InsertConfiguration,
  type UpdateConfiguration 
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Signals
  createSignal(signal: InsertSignal): Promise<Signal>;
  getRecentSignals(limit?: number): Promise<Signal[]>;
  getSignalsByTimeRange(startTime: Date, endTime: Date): Promise<Signal[]>;
  
  // Market Data
  insertMarketData(data: InsertMarketData[]): Promise<MarketData[]>;
  getLatestMarketData(symbol: string, timeframe: string, limit?: number): Promise<MarketData[]>;
  
  // Configuration
  getActiveConfiguration(): Promise<Configuration | undefined>;
  createConfiguration(config: InsertConfiguration): Promise<Configuration>;
  updateConfiguration(id: string, updates: UpdateConfiguration): Promise<Configuration | undefined>;
  deleteConfiguration(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private signals: Map<string, Signal>;
  private marketData: Map<string, MarketData>;
  private configurations: Map<string, Configuration>;

  constructor() {
    this.signals = new Map();
    this.marketData = new Map();
    this.configurations = new Map();
    
    // Create default configuration
    const defaultConfig: Configuration = {
      id: randomUUID(),
      symbol: 'XLM/USDT',
      timeframe: '5m',
      macdFast: 8,
      macdSlow: 17,
      macdSignal: 9,
      rsiPeriod: 14,
      rsiLower: 20,
      rsiUpper: 80,
      volumePeriod: 20,
      alertCooldown: 5,
      telegramEnabled: true,
      telegramToken: process.env.TELEGRAM_TOKEN || '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.configurations.set(defaultConfig.id, defaultConfig);
  }

  async createSignal(insertSignal: InsertSignal): Promise<Signal> {
    const id = randomUUID();
    const signal: Signal = {
      ...insertSignal,
      id,
      timestamp: new Date(),
      telegramSent: false,
    };
    this.signals.set(id, signal);
    return signal;
  }

  async getRecentSignals(limit = 10): Promise<Signal[]> {
    return Array.from(this.signals.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getSignalsByTimeRange(startTime: Date, endTime: Date): Promise<Signal[]> {
    return Array.from(this.signals.values())
      .filter(signal => signal.timestamp >= startTime && signal.timestamp <= endTime)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async insertMarketData(data: InsertMarketData[]): Promise<MarketData[]> {
    const insertedData: MarketData[] = [];
    
    for (const item of data) {
      const id = randomUUID();
      const marketDataItem: MarketData = { ...item, id };
      this.marketData.set(id, marketDataItem);
      insertedData.push(marketDataItem);
    }
    
    return insertedData;
  }

  async getLatestMarketData(symbol: string, timeframe: string, limit = 100): Promise<MarketData[]> {
    return Array.from(this.marketData.values())
      .filter(data => data.symbol === symbol && data.timeframe === timeframe)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getActiveConfiguration(): Promise<Configuration | undefined> {
    return Array.from(this.configurations.values())
      .find(config => config.isActive);
  }

  async createConfiguration(insertConfig: InsertConfiguration): Promise<Configuration> {
    const id = randomUUID();
    const config: Configuration = {
      ...insertConfig,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.configurations.set(id, config);
    return config;
  }

  async updateConfiguration(id: string, updates: UpdateConfiguration): Promise<Configuration | undefined> {
    const config = this.configurations.get(id);
    if (!config) return undefined;
    
    const updatedConfig: Configuration = {
      ...config,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.configurations.set(id, updatedConfig);
    return updatedConfig;
  }

  async deleteConfiguration(id: string): Promise<boolean> {
    return this.configurations.delete(id);
  }
}

export const storage = new MemStorage();
