import { 
  type Signal, 
  type InsertSignal, 
  type MarketData, 
  type InsertMarketData,
  type Configuration,
  type InsertConfiguration,
  type UpdateConfiguration,
  signals,
  marketData,
  configurations
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export interface IStorage {
  // Signals
  createSignal(signal: InsertSignal): Promise<Signal>;
  getRecentSignals(limit?: number): Promise<Signal[]>;
  getSignalsByTimeRange(startTime: Date, endTime: Date): Promise<Signal[]>;
  updateSignal(id: string, updates: Partial<Signal>): Promise<Signal | undefined>;
  
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
      telegramToken: process.env.TELEGRAM_TOKEN || null,
      telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
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
      const marketDataItem: MarketData = { 
        ...item, 
        id,
        rsi: item.rsi ?? null,
        macd: item.macd ?? null,
        macdSignal: item.macdSignal ?? null,
        macdHistogram: item.macdHistogram ?? null,
      };
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
      symbol: insertConfig.symbol || 'XLM/USDT',
      timeframe: insertConfig.timeframe || '5m',
      macdFast: insertConfig.macdFast || 8,
      macdSlow: insertConfig.macdSlow || 17,
      macdSignal: insertConfig.macdSignal || 9,
      rsiPeriod: insertConfig.rsiPeriod || 14,
      rsiLower: insertConfig.rsiLower || 20,
      rsiUpper: insertConfig.rsiUpper || 80,
      volumePeriod: insertConfig.volumePeriod || 20,
      alertCooldown: insertConfig.alertCooldown || 5,
      telegramEnabled: insertConfig.telegramEnabled ?? true,
      telegramToken: insertConfig.telegramToken || null,
      telegramChatId: insertConfig.telegramChatId || null,
      isActive: insertConfig.isActive ?? true,
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

  async updateSignal(id: string, updates: Partial<Signal>): Promise<Signal | undefined> {
    const signal = this.signals.get(id);
    if (!signal) return undefined;
    
    const updatedSignal = { ...signal, ...updates };
    this.signals.set(id, updatedSignal);
    return updatedSignal;
  }
}

export class DatabaseStorage implements IStorage {
  async createSignal(insertSignal: InsertSignal): Promise<Signal> {
    const [signal] = await db
      .insert(signals)
      .values(insertSignal)
      .returning();
    return signal;
  }

  async getRecentSignals(limit = 10): Promise<Signal[]> {
    return await db
      .select()
      .from(signals)
      .orderBy(desc(signals.timestamp))
      .limit(limit);
  }

  async getSignalsByTimeRange(startTime: Date, endTime: Date): Promise<Signal[]> {
    return await db
      .select()
      .from(signals)
      .where(
        and(
          gte(signals.timestamp, startTime),
          lte(signals.timestamp, endTime)
        )
      )
      .orderBy(desc(signals.timestamp));
  }

  async insertMarketData(data: InsertMarketData[]): Promise<MarketData[]> {
    return await db
      .insert(marketData)
      .values(data)
      .returning();
  }

  async getLatestMarketData(symbol: string, timeframe: string, limit = 100): Promise<MarketData[]> {
    return await db
      .select()
      .from(marketData)
      .where(
        and(
          eq(marketData.symbol, symbol),
          eq(marketData.timeframe, timeframe)
        )
      )
      .orderBy(desc(marketData.timestamp))
      .limit(limit);
  }

  async getActiveConfiguration(): Promise<Configuration | undefined> {
    const [config] = await db
      .select()
      .from(configurations)
      .where(eq(configurations.isActive, true))
      .limit(1);
    
    // Create default configuration if none exists
    if (!config) {
      const defaultConfig: InsertConfiguration = {
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
        telegramToken: process.env.TELEGRAM_TOKEN || null,
        telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
        isActive: true,
      };
      
      return await this.createConfiguration(defaultConfig);
    }
    
    return config;
  }

  async createConfiguration(insertConfig: InsertConfiguration): Promise<Configuration> {
    const [config] = await db
      .insert(configurations)
      .values(insertConfig)
      .returning();
    return config;
  }

  async updateConfiguration(id: string, updates: UpdateConfiguration): Promise<Configuration | undefined> {
    const [updatedConfig] = await db
      .update(configurations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(configurations.id, id))
      .returning();
    
    return updatedConfig || undefined;
  }

  async deleteConfiguration(id: string): Promise<boolean> {
    const result = await db
      .delete(configurations)
      .where(eq(configurations.id, id))
      .returning();
    
    return result.length > 0;
  }

  async updateSignal(id: string, updates: Partial<Signal>): Promise<Signal | undefined> {
    const [updatedSignal] = await db
      .update(signals)
      .set(updates)
      .where(eq(signals.id, id))
      .returning();
    
    return updatedSignal || undefined;
  }
}

// Temporarily use MemStorage due to database connection issues
export const storage = new MemStorage();
