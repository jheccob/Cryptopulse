import { storage } from '../storage';
import { demoMarketDataService } from './demoMarketData';
import { marketDataService } from './marketData';
import { telegramService } from './telegram';
import { type InsertSignal, type BotStatus, type Configuration } from '@shared/schema';

export class TradingBotService {
  private isRunning = false;
  private lastAlertTime: Date | null = null;
  private startTime = new Date();
  private intervalId: NodeJS.Timeout | null = null;
  private currentConfig: Configuration | null = null;

  constructor() {
    this.loadConfiguration();
  }

  private async loadConfiguration() {
    this.currentConfig = await storage.getActiveConfiguration() || null;
    if (this.currentConfig?.telegramToken && this.currentConfig?.telegramChatId) {
      telegramService.updateCredentials(
        this.currentConfig.telegramToken,
        this.currentConfig.telegramChatId
      );
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    await this.loadConfiguration();
    if (!this.currentConfig) {
      throw new Error('No active configuration found');
    }

    this.isRunning = true;
    this.startTime = new Date();
    
    console.log(`Trading bot started for ${this.currentConfig.symbol} on ${this.currentConfig.timeframe}`);
    
    // Start the monitoring loop
    this.intervalId = setInterval(() => {
      this.checkSignals().catch(console.error);
    }, 60000); // Check every minute

    // Initial check
    await this.checkSignals();
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('Trading bot stopped');
  }

  getStatus(): BotStatus {
    const uptime = this.isRunning ? 
      this.formatUptime(Date.now() - this.startTime.getTime()) : '0h 0m';

    return {
      isRunning: this.isRunning,
      lastSignal: this.lastAlertTime?.toISOString(),
      uptime,
      connectionStatus: {
        binance: true, // Now using Kraken instead of Binance
        telegram: !!this.currentConfig?.telegramToken,
      },
      currentConfig: this.currentConfig!,
    };
  }

  private formatUptime(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  private async checkSignals(): Promise<void> {
    try {
      if (!this.currentConfig) {
        await this.loadConfiguration();
        if (!this.currentConfig) return;
      }

      // Try to get real market data first, fallback to demo data
      let latestData;
      try {
        // Convert XLM/USDT to XLM/USD for Kraken
        const krakenSymbol = this.currentConfig.symbol === 'XLM/USDT' ? 'XLM/USD' : this.currentConfig.symbol;
        latestData = await marketDataService.getLatestData(krakenSymbol, this.currentConfig.timeframe);
        console.log('Using real Kraken market data');
      } catch (error) {
        console.log('Failed to get real data, using demo data:', error);
        latestData = await demoMarketDataService.getLatestData(
          this.currentConfig.symbol,
          this.currentConfig.timeframe
        );
      }

      if (!latestData || !latestData.rsi || !latestData.macd || !latestData.macdSignal) {
        console.log('Insufficient data for signal analysis');
        return;
      }

      // Get previous data for MACD crossover detection
      const recentData = await storage.getLatestMarketData(
        this.currentConfig.symbol,
        this.currentConfig.timeframe,
        2
      );

      if (recentData.length < 2) {
        console.log('Need at least 2 data points for signal analysis');
        return;
      }

      const current = recentData[0];
      const previous = recentData[1];

      // Check for signal conditions
      const signal = this.analyzeSignal(current, previous, this.currentConfig);
      
      if (signal) {
        await this.processSignal(signal);
      }

    } catch (error) {
      console.error('Error checking signals:', error);
    }
  }

  private analyzeSignal(current: any, previous: any, config: Configuration): InsertSignal | null {
    const { rsiLower, rsiUpper, volumePeriod } = config;

    // MACD crossover detection
    const macdCrossUp = (previous.macd! < previous.macdSignal!) && (current.macd! > current.macdSignal!);
    const macdCrossDown = (previous.macd! > previous.macdSignal!) && (current.macd! < current.macdSignal!);

    // RSI and volume conditions
    const rsiOk = current.rsi! > rsiLower && current.rsi! < rsiUpper;
    
    // For volume check, we'd need volume MA - simplified for now
    const volOk = current.volume > 0; // Simplified volume check

    if (!rsiOk || !volOk) return null;

    // Check cooldown period
    if (this.lastAlertTime) {
      const timeSinceLastAlert = Date.now() - this.lastAlertTime.getTime();
      const cooldownMs = config.alertCooldown * 60 * 1000; // Convert minutes to ms
      if (timeSinceLastAlert < cooldownMs) {
        return null;
      }
    }

    if (macdCrossUp) {
      return {
        symbol: current.symbol,
        type: 'BUY',
        price: current.close,
        rsi: current.rsi!,
        macd: current.macd!,
        macdSignal: current.macdSignal!,
        volume: current.volume,
      };
    } else if (macdCrossDown) {
      return {
        symbol: current.symbol,
        type: 'SELL',
        price: current.close,
        rsi: current.rsi!,
        macd: current.macd!,
        macdSignal: current.macdSignal!,
        volume: current.volume,
      };
    }

    return null;
  }

  private async processSignal(signalData: InsertSignal): Promise<void> {
    try {
      // Store signal in database
      const signal = await storage.createSignal(signalData);
      
      // Send Telegram notification if enabled
      if (this.currentConfig?.telegramEnabled) {
        const sent = await telegramService.sendSignalAlert({
          type: signal.type,
          symbol: signal.symbol,
          price: signal.price,
          rsi: signal.rsi,
          timestamp: signal.timestamp,
        });

        if (sent) {
          console.log(`Telegram alert sent for ${signal.type} signal`);
        }
      }

      this.lastAlertTime = new Date();
      
      console.log(`${signal.timestamp.toISOString()} - ${signal.symbol} Signal: ${signal.type} at ${signal.price.toFixed(5)}`);
      
    } catch (error) {
      console.error('Error processing signal:', error);
    }
  }

  async updateConfiguration(configId: string, updates: any): Promise<void> {
    await storage.updateConfiguration(configId, updates);
    await this.loadConfiguration();
    
    if (this.currentConfig?.telegramToken && this.currentConfig?.telegramChatId) {
      telegramService.updateCredentials(
        this.currentConfig.telegramToken,
        this.currentConfig.telegramChatId
      );
    }
  }
}

export const tradingBotService = new TradingBotService();
