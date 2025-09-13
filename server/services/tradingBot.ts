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
  private broadcastFunction: ((message: any) => void) | null = null;
  private startupProtectionTime: Date | null = null;

  constructor() {
    this.loadConfiguration();
  }

  // Method to set the broadcast function for WebSocket communication
  setBroadcastFunction(broadcastFn: (message: any) => void): void {
    this.broadcastFunction = broadcastFn;
  }

  private async loadConfiguration() {
    this.currentConfig = await storage.getActiveConfiguration() || null;
    
    // Priorizar variáveis de ambiente, depois configuração do banco
    const telegramToken = process.env.TELEGRAM_TOKEN || this.currentConfig?.telegramToken;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID || this.currentConfig?.telegramChatId;
    
    if (telegramToken && telegramChatId) {
      telegramService.updateCredentials(telegramToken, telegramChatId);
      console.log('✅ Credenciais do Telegram carregadas com sucesso');
    } else {
      console.log('⚠️ Credenciais do Telegram não encontradas');
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
    this.startupProtectionTime = new Date(); // Ativar proteção de inicialização
    
    console.log(`Trading bot started for ${this.currentConfig.symbol} on ${this.currentConfig.timeframe}`);
    console.log('🛡️ Proteção de inicialização ativada - sem sinais por 2 minutos');
    
    // Start the monitoring loop - check every 30 seconds for faster signal detection
    this.intervalId = setInterval(() => {
      console.log('🔄 Running signal check...');
      this.checkSignals().catch(console.error);
    }, 30000); // Check every 30 seconds

    // Remover verificação inicial - esperar primeiro intervalo para evitar sinais imediatos
    // await this.checkSignals();
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.startupProtectionTime = null; // Reset proteção de inicialização
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('Trading bot stopped');
  }

  getStatus(): BotStatus {
    const uptime = this.isRunning ? 
      this.formatUptime(Date.now() - this.startTime.getTime()) : '0h 0m';

    // Verificar se temos credenciais do Telegram (env vars ou config)
    const telegramToken = process.env.TELEGRAM_TOKEN || this.currentConfig?.telegramToken;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID || this.currentConfig?.telegramChatId;
    const hasTelegramCredentials = !!(telegramToken && telegramChatId);

    return {
      isRunning: this.isRunning,
      lastSignal: this.lastAlertTime?.toISOString(),
      uptime,
      connectionStatus: {
        binance: true, // Now using Coinbase instead of Binance
        telegram: hasTelegramCredentials,
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
        // Convert XLM/USDT to XLM-USD for Coinbase
        const coinbaseSymbol = this.currentConfig.symbol.replace('/', '-');
        
        // Get market data with indicators
        const marketDataArray = await marketDataService.processMarketData(
          coinbaseSymbol, 
          this.currentConfig.timeframe, 
          this.currentConfig
        );
        
        if (marketDataArray.length > 0) {
          latestData = marketDataArray[marketDataArray.length - 1];
          console.log('Using real Coinbase market data');
          
          // Broadcast real-time data via WebSocket if available
          if (this.broadcastFunction) {
            this.broadcastFunction({
              type: 'MARKET_DATA',
              data: latestData,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          throw new Error('No market data available');
        }
      } catch (error) {
        console.log('Failed to get real data, using demo data:', error);
        latestData = await demoMarketDataService.getLatestData(
          this.currentConfig.symbol,
          this.currentConfig.timeframe
        );
      }

      if (!latestData) {
        console.log('❌ No market data received from Coinbase');
        return;
      }
      
      console.log('📊 Dados recebidos:', {
        price: latestData.close,
        rsi: latestData.rsi,
        macd: latestData.macd,
        macdSignal: latestData.macdSignal,
        hasRSI: !!latestData.rsi,
        hasMacd: !!latestData.macd,
        hasMacdSignal: !!latestData.macdSignal
      });
      
      if (!latestData.rsi || !latestData.macd || !latestData.macdSignal) {
        console.log('❌ Insufficient data for signal analysis - missing indicators');
        console.log(`   RSI: ${latestData.rsi}, MACD: ${latestData.macd}, MACD Signal: ${latestData.macdSignal}`);
        return;
      }

      // Since we're getting fresh data, let's analyze based on the current data
      // and use a more aggressive signal detection approach
      const currentPrice = latestData.close;
      const currentRSI = latestData.rsi!;
      const currentMACD = latestData.macd!;
      const currentMACDSignal = latestData.macdSignal!;

      console.log(`Current data: Price=${currentPrice}, RSI=${currentRSI.toFixed(1)}, MACD=${currentMACD.toFixed(6)}, Signal=${currentMACDSignal.toFixed(6)}`);

      // Check for signal conditions with more aggressive thresholds
      const signal = this.analyzeSignalRealTime(latestData, this.currentConfig);
      
      if (signal) {
        await this.processSignal(signal);
      }

    } catch (error) {
      console.error('Error checking signals:', error);
    }
  }

  private analyzeSignalRealTime(current: any, config: Configuration): InsertSignal | null {
    const { rsiLower, rsiUpper } = config;
    
    // Check startup protection period (2 minutes)
    if (this.startupProtectionTime) {
      const timeSinceStartup = Date.now() - this.startupProtectionTime.getTime();
      const startupProtectionMs = 2 * 60 * 1000; // 2 minutes in ms
      if (timeSinceStartup < startupProtectionMs) {
        const remainingSeconds = Math.floor((startupProtectionMs - timeSinceStartup) / 1000);
        console.log(`🛡️ Proteção de inicialização ativa: ${remainingSeconds}s restantes`);
        return null;
      }
      // Disable startup protection after 2 minutes
      this.startupProtectionTime = null;
      console.log('✅ Proteção de inicialização desativada - bot pronto para detectar sinais');
    }
    
    // Check cooldown period
    if (this.lastAlertTime) {
      const timeSinceLastAlert = Date.now() - this.lastAlertTime.getTime();
      const cooldownMs = config.alertCooldown * 60 * 1000; // Convert minutes to ms
      if (timeSinceLastAlert < cooldownMs) {
        console.log(`Cooldown active: ${Math.floor((cooldownMs - timeSinceLastAlert) / 1000)}s remaining`);
        return null;
      }
    }

    const currentRSI = current.rsi!;
    const currentMACD = current.macd!;
    const currentMACDSignal = current.macdSignal!;

    // More aggressive signal detection
    // BUY signals: RSI oversold or MACD above signal line
    const buyConditions = [
      currentRSI <= rsiLower + 10, // RSI oversold or near oversold
      currentMACD > currentMACDSignal && currentMACD > -0.001, // MACD bullish
    ];

    // SELL signals: RSI overbought or MACD below signal line  
    const sellConditions = [
      currentRSI >= rsiUpper - 10, // RSI overbought or near overbought
      currentMACD < currentMACDSignal && currentMACD < 0.001, // MACD bearish
    ];

    const buyScore = buyConditions.filter(Boolean).length;
    const sellScore = sellConditions.filter(Boolean).length;

    console.log(`Signal analysis: BUY score=${buyScore}/2, SELL score=${sellScore}/2`);

    if (buyScore >= 1) { // At least 1 buy condition
      console.log(`🟢 BUY signal detected! RSI=${currentRSI.toFixed(1)}, MACD=${currentMACD > currentMACDSignal ? 'bullish' : 'bearish'}`);
      return {
        symbol: current.symbol,
        type: 'BUY',
        price: current.close,
        rsi: current.rsi!,
        macd: current.macd!,
        macdSignal: current.macdSignal!,
        volume: current.volume,
      };
    } else if (sellScore >= 1) { // At least 1 sell condition
      console.log(`🔴 SELL signal detected! RSI=${currentRSI.toFixed(1)}, MACD=${currentMACD < currentMACDSignal ? 'bearish' : 'bullish'}`);
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

    console.log('No signal conditions met');
    return null;
  }

  private async processSignal(signalData: InsertSignal): Promise<void> {
    try {
      // Store signal in database
      const signal = await storage.createSignal(signalData);
      
      console.log(`🚨 NOVO SINAL: ${signal.type} ${signal.symbol} por $${signal.price.toFixed(5)} | RSI: ${signal.rsi.toFixed(1)}`);

      // Also broadcast signal via WebSocket for real-time dashboard updates
      if (this.broadcastFunction) {
        this.broadcastFunction({
          type: 'SIGNAL',
          data: signal,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Tentar enviar para Telegram usando credenciais disponíveis
      const telegramToken = process.env.TELEGRAM_TOKEN || this.currentConfig?.telegramToken;
      const telegramChatId = process.env.TELEGRAM_CHAT_ID || this.currentConfig?.telegramChatId;
      
      if (telegramToken && telegramChatId) {
        // Atualizar credenciais do serviço Telegram
        telegramService.updateCredentials(telegramToken, telegramChatId);
        
        // Testar conexão primeiro
        const isConnected = await telegramService.testConnection();
        if (!isConnected) {
          console.log('❌ Falha na conexão com o Telegram - verifique as credenciais');
          return;
        }
        
        const sent = await telegramService.sendSignalAlert({
          type: signal.type,
          symbol: signal.symbol,
          price: signal.price,
          rsi: signal.rsi,
          timestamp: signal.timestamp,
          macd: signal.macd,
          macdSignal: signal.macdSignal,
        });

        if (sent) {
          console.log('✅ Sinal enviado para Telegram com sucesso!');
          // Atualizar o sinal como enviado
          await storage.updateSignal(signal.id, { telegramSent: true });
        } else {
          console.log('❌ Falha ao enviar sinal para Telegram - verifique token e chat ID');
        }
      } else {
        console.log('⚠️ Credenciais do Telegram não configuradas');
        console.log('   Configure TELEGRAM_TOKEN e TELEGRAM_CHAT_ID nas variáveis de ambiente');
        console.log('   ou adicione nas configurações do bot');
      }

      this.lastAlertTime = new Date();
      
    } catch (error) {
      console.error('Error processing signal:', error);
    }
  }

  async updateConfiguration(configId: string, updates: any): Promise<void> {
    await storage.updateConfiguration(configId, updates);
    await this.loadConfiguration();
    
    // Recarregar credenciais após atualização
    const telegramToken = process.env.TELEGRAM_TOKEN || this.currentConfig?.telegramToken;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID || this.currentConfig?.telegramChatId;
    
    if (telegramToken && telegramChatId) {
      telegramService.updateCredentials(telegramToken, telegramChatId);
      console.log('✅ Configurações do Telegram atualizadas');
    }
  }
}

export const tradingBotService = new TradingBotService();
