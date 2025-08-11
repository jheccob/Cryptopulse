import { Router } from 'express';
import { marketDataService } from '../services/marketData';
import { storage } from '../storage';

const router = Router();

// Get real-time market data endpoint
router.get('/realtime/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const coinbaseSymbol = symbol.replace('/', '-');
    
    // Get current configuration
    const config = await storage.getActiveConfiguration();
    if (!config) {
      return res.status(404).json({ message: "No active configuration found" });
    }

    // Get latest market data with indicators
    const marketDataArray = await marketDataService.processMarketData(
      coinbaseSymbol, 
      config.timeframe, 
      config
    );
    
    if (marketDataArray.length === 0) {
      return res.status(404).json({ message: "No market data available" });
    }

    const latest = marketDataArray[marketDataArray.length - 1];
    
    res.json({
      symbol: latest.symbol,
      price: latest.close,
      rsi: latest.rsi,
      macd: latest.macd,
      macdSignal: latest.macdSignal,
      volume: latest.volume,
      timestamp: latest.timestamp,
      exchange: 'Coinbase',
      timeframe: config.timeframe
    });
    
  } catch (error) {
    console.error('Error fetching real-time data:', error);
    res.status(500).json({ 
      message: "Failed to fetch real-time data", 
      error: (error as Error).message 
    });
  }
});

export default router;