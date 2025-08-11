import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { tradingBotService } from "./services/tradingBot";
import { demoMarketDataService } from "./services/demoMarketData";
import { marketDataService } from "./services/marketData";
import { telegramService } from "./services/telegram";
import { insertConfigurationSchema, updateConfigurationSchema, type WebSocketMessage } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Store connected clients
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('WebSocket client connected');

    // Send initial bot status
    const status = tradingBotService.getStatus();
    const message: WebSocketMessage = {
      type: 'BOT_STATUS',
      data: status,
      timestamp: new Date().toISOString(),
    };
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }

    ws.on('close', () => {
      clients.delete(ws);
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  // Broadcast function for real-time updates
  const broadcast = (message: WebSocketMessage) => {
    const messageStr = JSON.stringify(message);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  };

  // API Routes

  // Get bot status
  app.get("/api/bot/status", async (req, res) => {
    try {
      const status = tradingBotService.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get bot status" });
    }
  });

  // Start bot
  app.post("/api/bot/start", async (req, res) => {
    try {
      await tradingBotService.start();
      await demoMarketDataService.start();
      
      const status = tradingBotService.getStatus();
      broadcast({
        type: 'BOT_STATUS',
        data: status,
        timestamp: new Date().toISOString(),
      });
      
      res.json({ message: "Bot started successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to start bot", error: (error as Error).message });
    }
  });

  // Stop bot
  app.post("/api/bot/stop", async (req, res) => {
    try {
      tradingBotService.stop();
      demoMarketDataService.stop();
      
      const status = tradingBotService.getStatus();
      broadcast({
        type: 'BOT_STATUS',
        data: status,
        timestamp: new Date().toISOString(),
      });
      
      res.json({ message: "Bot stopped successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to stop bot" });
    }
  });

  // Get recent signals
  app.get("/api/signals", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      let signals = await storage.getRecentSignals(limit);
      
      // Generate demo signals if none exist
      if (signals.length === 0) {
        const demoSignals = [
          {
            symbol: 'XLM/USDT',
            type: 'BUY',
            price: 0.11583,
            rsi: 35.2,
            macd: 0.00012,
            macdSignal: 0.00008,
            volume: 125000,
          },
          {
            symbol: 'XLM/USDT', 
            type: 'SELL',
            price: 0.11601,
            rsi: 68.7,
            macd: -0.00015,
            macdSignal: 0.00002,
            volume: 98000,
          },
          {
            symbol: 'XLM/USDT',
            type: 'BUY', 
            price: 0.11567,
            rsi: 28.9,
            macd: 0.00018,
            macdSignal: 0.00011,
            volume: 156000,
          }
        ];
        
        for (let i = 0; i < demoSignals.length; i++) {
          const signalTime = new Date(Date.now() - (i + 1) * 3600000); // 1 hour apart
          await storage.createSignal({
            ...demoSignals[i],
          });
        }
        
        signals = await storage.getRecentSignals(limit);
      }
      
      res.json(signals);
    } catch (error) {
      res.status(500).json({ message: "Failed to get signals" });
    }
  });

  // Get signals by time range
  app.get("/api/signals/range", async (req, res) => {
    try {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }
      
      const signals = await storage.getSignalsByTimeRange(new Date(start as string), new Date(end as string));
      res.json(signals);
    } catch (error) {
      res.status(500).json({ message: "Failed to get signals by range" });
    }
  });

  // Get latest market data
  app.get("/api/market-data/:symbol/:timeframe", async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      
      let data = await storage.getLatestMarketData(symbol, timeframe, limit);
      
      // If no data exists, generate demo data
      if (data.length === 0) {
        const config = await storage.getActiveConfiguration();
        if (config) {
          const demoData = await demoMarketDataService.processMarketData(symbol, timeframe, config);
          await storage.insertMarketData(demoData);
          data = await storage.getLatestMarketData(symbol, timeframe, limit);
        }
      }
      
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to get market data" });
    }
  });

  // Get active configuration
  app.get("/api/config", async (req, res) => {
    try {
      const config = await storage.getActiveConfiguration();
      if (!config) {
        return res.status(404).json({ message: "No active configuration found" });
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to get configuration" });
    }
  });

  // Update configuration
  app.patch("/api/config/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = updateConfigurationSchema.parse(req.body);
      
      const updatedConfig = await storage.updateConfiguration(id, updates);
      if (!updatedConfig) {
        return res.status(404).json({ message: "Configuration not found" });
      }

      // Update bot configuration
      await tradingBotService.updateConfiguration(id, updates);
      
      // Broadcast configuration update
      broadcast({
        type: 'CONFIG_UPDATE',
        data: updatedConfig,
        timestamp: new Date().toISOString(),
      });
      
      res.json(updatedConfig);
    } catch (error) {
      res.status(500).json({ message: "Failed to update configuration" });
    }
  });

  // Create new configuration
  app.post("/api/config", async (req, res) => {
    try {
      const configData = insertConfigurationSchema.parse(req.body);
      
      // Deactivate current config if this one is being set as active
      if (configData.isActive) {
        const currentConfig = await storage.getActiveConfiguration();
        if (currentConfig) {
          await storage.updateConfiguration(currentConfig.id, { isActive: false });
        }
      }
      
      const config = await storage.createConfiguration(configData);
      res.status(201).json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to create configuration" });
    }
  });

  // Test Telegram connection
  app.post("/api/telegram/test", async (req, res) => {
    try {
      const { token, chatId } = req.body;
      
      if (!token || !chatId) {
        return res.status(400).json({ message: "Token and chatId are required" });
      }
      
      const originalToken = process.env.TELEGRAM_TOKEN;
      const originalChatId = process.env.TELEGRAM_CHAT_ID;
      
      // Temporarily update credentials for testing
      telegramService.updateCredentials(token, chatId);
      
      const isConnected = await telegramService.testConnection();
      
      if (isConnected) {
        await telegramService.sendMessage("✅ Telegram connection test successful!");
      }
      
      // Restore original credentials
      telegramService.updateCredentials(originalToken || '', originalChatId || '');
      
      res.json({ connected: isConnected });
    } catch (error) {
      res.status(500).json({ message: "Failed to test Telegram connection" });
    }
  });

  // Send test signal to Telegram
  app.post("/api/telegram/send-signal", async (req, res) => {
    try {
      // Get the most recent signal from database
      const recentSignals = await storage.getRecentSignals(1);
      if (recentSignals.length === 0) {
        return res.status(404).json({ message: "No signals found" });
      }

      const signal = recentSignals[0];
      
      // Send signal to Telegram
      const sent = await telegramService.sendSignalAlert({
        type: signal.type,
        symbol: signal.symbol,
        price: signal.price,
        rsi: signal.rsi,
        timestamp: new Date(signal.timestamp)
      });

      if (sent) {
        // Update signal as sent in database
        await storage.updateSignal(signal.id, { telegramSent: true });
        res.json({ message: "Signal sent to Telegram successfully", signal });
      } else {
        res.status(500).json({ message: "Failed to send signal to Telegram" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to send signal", error: (error as Error).message });
    }
  });

  // Test Kraken/Exchange API connection
  app.get("/api/exchange/test", async (req, res) => {
    try {
      const testData = await marketDataService.fetchOHLCV('XLM/USD', '5m', 5);
      res.json({ 
        status: "success",
        exchange: "Kraken",
        message: "Exchange API is working correctly",
        sampleData: testData.slice(0, 2) // Show only first 2 entries
      });
    } catch (error) {
      res.status(500).json({ 
        status: "error",
        message: "Failed to connect to exchange", 
        error: (error as Error).message 
      });
    }
  });

  // Test full market data processing with indicators
  app.get("/api/exchange/test-indicators", async (req, res) => {
    try {
      const config = await storage.getActiveConfiguration();
      if (!config) {
        return res.status(404).json({ message: "No active configuration found" });
      }

      const marketDataArray = await marketDataService.processMarketData('XLM/USD', '5m', config);
      const latestData = marketDataArray[marketDataArray.length - 1];
      
      res.json({ 
        status: "success",
        exchange: "Kraken",
        message: "Technical indicators calculated successfully",
        latestData: {
          symbol: latestData.symbol,
          timestamp: latestData.timestamp,
          price: latestData.close,
          rsi: latestData.rsi,
          macd: latestData.macd,
          macdSignal: latestData.macdSignal,
          volume: latestData.volume
        },
        totalDataPoints: marketDataArray.length
      });
    } catch (error) {
      res.status(500).json({ 
        status: "error",
        message: "Failed to process market data with indicators", 
        error: (error as Error).message 
      });
    }
  });

  // Periodic broadcasts for real-time updates
  setInterval(() => {
    const status = tradingBotService.getStatus();
    broadcast({
      type: 'BOT_STATUS',
      data: status,
      timestamp: new Date().toISOString(),
    });
  }, 30000); // Every 30 seconds

  return httpServer;
}
