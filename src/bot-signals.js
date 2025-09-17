import ccxt from "ccxt";
import TelegramBot from "node-telegram-bot-api";

// ===== CONFIGURAÇÕES =====
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "SEU_TOKEN_AQUI";
const CHAT_ID = process.env.CHAT_ID || "SEU_CHAT_ID_AQUI";

const SYMBOL = "XLM/USDT";
const TIMEFRAME = "5m";

const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const RSI_PERIOD = 14; // Wilder RSI padrão mais estável
const RSI_MIN = 30;
const RSI_MAX = 70;
const VOLUME_MA = 20;

const SIGNAL_COOLDOWN_MS = 5 * 60 * 1000; // cooldown entre sinais para o mesmo par (5 minutos)

const exchange = new ccxt.binance({ enableRateLimit: true });
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// mapa para controlar cooldown por par
const lastSignalTime = new Map();

// log de erros no polling do Telegram
bot.on("polling_error", (err) => {
  console.error("Telegram polling error:", err?.message ?? err);
});

// validação básica das credenciais (apenas alerta para facilitar debug)
if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === "SEU_TOKEN_AQUI") {
  console.warn("AVISO: TELEGRAM_TOKEN não foi definido corretamente. Verifique a variável de ambiente.");
}
if (!CHAT_ID || CHAT_ID === "SEU_CHAT_ID_AQUI") {
  console.warn("AVISO: CHAT_ID não foi definido corretamente. Verifique a variável de ambiente.");
}

// Teste rápido de envio e logs (executa ao iniciar)
(async () => {
  try {
    console.log("DEBUG: executando teste de inicialização do bot...");
    await bot.sendMessage(CHAT_ID, "🔧 Bot iniciado — teste de envio (mensagem automática). Bot pronto para análise em tempo real.");
    console.log("DEBUG: mensagem de teste enviada com sucesso ao CHAT_ID:", CHAT_ID);
  } catch (err) {
    console.error("ERRO DEBUG: não foi possível enviar mensagem de teste ao Telegram:", err);
  }
})();

// ===== FUNÇÕES =====
async function getOHLCV(symbol, limit = 500) {
  try {
    const data = await exchange.fetchOHLCV(symbol, TIMEFRAME, undefined, limit);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("fetchOHLCV retornou vazio ou formato inesperado");
    }
    return data.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp: new Date(timestamp),
      open,
      high,
      low,
      close,
      volume,
    }));
  } catch (err) {
    console.error(`Erro em getOHLCV para ${symbol}:`, err?.message ?? err);
    throw err;
  }
}

// EMA com inicialização simples (SMA) e fator exponencial
function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return Array(values.length).fill(null);
  const k = 2 / (period + 1);
  const out = Array(values.length).fill(null);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// MACD (fast EMA - slow EMA), sinal é EMA do MACD
function macdSeries(closes, fast = MACD_FAST, slow = MACD_SLOW, signal = MACD_SIGNAL) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macd = closes.map((_, i) => (typeof emaFast[i] === "number" && typeof emaSlow[i] === "number" ? emaFast[i] - emaSlow[i] : null));
  // substitui null por 0 para cálculo da signal line, mas manteremos nulls ao retornar
  const macdForSignal = macd.map(v => (v === null ? 0 : v));
  const signalLine = ema(macdForSignal, signal);
  const hist = macd.map((v, i) => (v === null || typeof signalLine[i] !== "number" ? null : v - signalLine[i]));
  return { macd, signalLine, hist };
}

// RSI Wilder (com suavização de Wilder)
function rsiWilder(closes, period = RSI_PERIOD) {
  const out = Array(closes.length).fill(null);
  if (!Array.isArray(closes) || closes.length <= period) return out;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gain += diff;
    else loss += -diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function sma(values, period) {
  if (!Array.isArray(values) || values.length < period) return Array(values.length).fill(null);
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] || 0;
    if (i >= period) sum -= values[i - period] || 0;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function calculateIndicators(df) {
  const closes = df.map((c) => c.close);
  const volumes = df.map((c) => c.volume || 0);

  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const macd = macdSeries(closes, MACD_FAST, MACD_SLOW, MACD_SIGNAL);
  const rsiArr = rsiWilder(closes, RSI_PERIOD);
  const volSma = sma(volumes, VOLUME_MA);

  for (let i = 0; i < df.length; i++) {
    df[i].ema50 = typeof ema50[i] === "number" ? ema50[i] : null;
    df[i].ema200 = typeof ema200[i] === "number" ? ema200[i] : null;
    df[i].macd = typeof macd.macd[i] === "number" ? macd.macd[i] : null;
    df[i].macdSignal = typeof macd.signalLine[i] === "number" ? macd.signalLine[i] : null;
    df[i].macdHist = typeof macd.hist[i] === "number" ? macd.hist[i] : null;
    df[i].rsi = typeof rsiArr[i] === "number" ? rsiArr[i] : null;
    df[i].volSma = typeof volSma[i] === "number" ? volSma[i] : null;
  }
  return df;
}

function checkSignal(df) {
  const i = df.length - 1;
  const last = df[i];
  const prev = df[i - 1] || {};

  // segurança: precisa de dados suficientes
  if (!last || last.rsi === null || last.macd === null || last.macdSignal === null || last.volSma === null) return null;

  // cooldown: evita múltiplos sinais consecutivos
  const lastTs = lastSignalTime.get(SYMBOL) || 0;
  if (Date.now() - lastTs < SIGNAL_COOLDOWN_MS) {
    console.log(`Cooldown ativo para ${SYMBOL}, pulando geração de sinal.`);
    return null;
  }

  // tendência
  const trendBull = last.ema50 !== null && last.ema200 !== null && last.ema50 > last.ema200;
  const trendBear = last.ema50 !== null && last.ema200 !== null && last.ema50 < last.ema200;

  // MACD crossover
  const macdCrossoverUp = prev.macd !== null && prev.macdSignal !== null && prev.macd < prev.macdSignal && last.macd > last.macdSignal;
  const macdCrossoverDown = prev.macd !== null && prev.macdSignal !== null && prev.macd > prev.macdSignal && last.macd < last.macdSignal;

  // RSI condições
  const rsiBuy = last.rsi < RSI_MIN; // oversold
  const rsiSell = last.rsi > RSI_MAX; // overbought

  // volume confirmação
  const volumeOk = last.volume && last.volSma && last.volume > last.volSma * 0.8;

  // contador de confirmações
  let confirmationsBuy = 0;
  let confirmationsSell = 0;

  if (macdCrossoverUp) confirmationsBuy++;
  if (rsiBuy) confirmationsBuy++;
  if (trendBull) confirmationsBuy++;
  if (volumeOk) confirmationsBuy++;

  if (macdCrossoverDown) confirmationsSell++;
  if (rsiSell) confirmationsSell++;
  if (trendBear) confirmationsSell++;
  if (volumeOk) confirmationsSell++;

  // regra: precisa de pelo menos 2 confirmações e volume
  const minConfirms = 2;

  if (confirmationsBuy >= minConfirms && volumeOk) {
    lastSignalTime.set(SYMBOL, Date.now());
    return { side: "COMPRA", reason: "Multi-confirmation BUY", details: { confirmationsBuy, rsi: last.rsi, macd: last.macd, ema50: last.ema50, ema200: last.ema200 } };
  }
  if (confirmationsSell >= minConfirms && volumeOk) {
    lastSignalTime.set(SYMBOL, Date.now());
    return { side: "VENDA", reason: "Multi-confirmation SELL", details: { confirmationsSell, rsi: last.rsi, macd: last.macd, ema50: last.ema50, ema200: last.ema200 } };
  }

  return { side: "NEUTRO" };
}

// ===== LOOP AUTOMÁTICO =====
async function autoLoop() {
  try {
    const df = await getOHLCV(SYMBOL, 500);
    if (!Array.isArray(df) || df.length === 0) {
      console.warn("autoLoop: dados inválidos de OHLCV, pulando execução.");
      return;
    }
    const withIndicators = calculateIndicators(df);
    const last = withIndicators[withIndicators.length - 1];
    const signalObj = checkSignal(withIndicators);

    // log detalhado para ajudar no debug
    console.log(
      `[${new Date().toISOString()}] ${SYMBOL} close=${last.close} rsi=${last.rsi} macd=${last.macd} ema50=${last.ema50} ema200=${last.ema200} signal=${signalObj ? signalObj.side : 'N/A'} `
    );

    if (signalObj && signalObj.side && signalObj.side !== "NEUTRO") {
      const price = last.close;
      const msg = `🚨 SINAL ${signalObj.side}\nPar: ${SYMBOL}\n💰 Preço: ${price}\nRSI: ${last.rsi !== null ? last.rsi.toFixed(2) : "N/A"}\nMotivo: ${signalObj.reason}`;
      try {
        await bot.sendMessage(CHAT_ID, msg);
        console.log("Mensagem enviada:", msg);
      } catch (sendErr) {
        console.error("Erro ao enviar mensagem ao Telegram:", sendErr?.message ?? sendErr);
      }
    }
  } catch (e) {
    console.error("Erro no loop (stack):", e && e.stack ? e.stack : e);
  }
}

// roda automático a cada 1 min, e roda imediatamente ao iniciar
autoLoop().catch((e) => console.error("Erro no primeiro run do autoLoop:", e?.message ?? e));
setInterval(autoLoop, 60 * 1000);

// ===== COMANDOS MANUAIS =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🤖 Olá! Eu sou seu bot de sinais.\n\nUse:\n`/signal BTC/USDT` → analisa uma moeda\n`/status` → mostra o que estou monitorando.",
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id, `Atualmente monitorando: ${SYMBOL} no timeframe ${TIMEFRAME}`);
});

bot.onText(/\/signal (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  try {
    const df = await getOHLCV(symbol, 500);
    const withIndicators = calculateIndicators(df);
    const signal = checkSignal(withIndicators);
    const price = withIndicators[withIndicators.length - 1].close;
    const rsi = withIndicators[withIndicators.length - 1].rsi;
    bot.sendMessage(
      msg.chat.id,
      `📊 Análise de ${symbol}\n💰 Preço: ${price}\nRSI: ${rsi !== null ? rsi.toFixed(2) : "N/A"}\nSinal: ${signal && signal.side ? signal.side : "NEUTRO"}`
    );
  } catch (e) {
    bot.sendMessage(msg.chat.id, `Erro ao analisar ${symbol}: ${e?.message ?? e}`);
  }
});
