import axios from 'axios';

export class TelegramService {
  private token: string;
  private chatId: string;

  constructor(token?: string, chatId?: string) {
    this.token = token || process.env.TELEGRAM_TOKEN || '';
    this.chatId = chatId || process.env.TELEGRAM_CHAT_ID || '';
  }

  updateCredentials(token: string, chatId: string) {
    this.token = token;
    this.chatId = chatId;
  }

  async sendMessage(message: string): Promise<boolean> {
    if (!this.token || !this.chatId) {
      console.warn('Telegram credentials not configured');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      const response = await axios.post(url, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'HTML'
      });

      return response.data.ok;
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      return false;
    }
  }

  async sendSignalAlert(signal: {
    type: string;
    symbol: string;
    price: number;
    rsi: number;
    timestamp: Date;
    macd?: number;
    macdSignal?: number;
  }): Promise<boolean> {
    const timeStr = signal.timestamp.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const signalIcon = signal.type === 'BUY' ? '🟢 COMPRAR' : '🔴 VENDER';
    const priceDirection = signal.type === 'BUY' ? '⬆️' : '⬇️';
    
    let message = `${signalIcon}
    
📊 <b>Par:</b> ${signal.symbol}
💰 <b>Preço:</b> $${signal.price.toFixed(5)} ${priceDirection}
📈 <b>RSI:</b> ${signal.rsi.toFixed(1)}`;

    if (signal.macd !== undefined && signal.macdSignal !== undefined) {
      message += `
📉 <b>MACD:</b> ${signal.macd.toFixed(6)}
📊 <b>Signal:</b> ${signal.macdSignal.toFixed(6)}`;
    }

    message += `
⏰ <b>Horário:</b> ${timeStr}
🔄 <b>Exchange:</b> Coinbase

💡 <i>Baseado em análise técnica automatizada</i>`;

    return await this.sendMessage(message);
  }

  async testConnection(): Promise<boolean> {
    if (!this.token) return false;

    try {
      const url = `https://api.telegram.org/bot${this.token}/getMe`;
      const response = await axios.get(url);
      return response.data.ok;
    } catch (error) {
      console.error('Error testing Telegram connection:', error);
      return false;
    }
  }
}

export const telegramService = new TelegramService();
