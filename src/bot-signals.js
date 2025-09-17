import ccxt from "ccxt";
import TelegramBot from "node-telegram-bot-api";

// ===== CONFIGURAÇÕES =====
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "SEU_TOKEN_AQUI";
const CHAT_ID = process.env.CHAT_ID || "SEU_CHAT_ID_AQUI"; // usado apenas para notificações gerais

const DEFAULT_SYMBOL = "XLM/USDT";
const TIMEFRAME = "5m";

const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const RSI_PERIOD = 14; // Wilder RSI padrão mais estável
const RSI_MIN = 30;
const RSI_MAX = 70;
const VOLUME_MA = 20;

const SIGNAL_COOLDOWN_MS = 5 * 60 * 1000; // cooldown entre sinais para o mesmo par (5 minutos)

// PREMIUM_CHAT_IDS: comma-separated list of Telegram chat IDs that are premium (unlimited /analise)
const PREMIUM_CHAT_IDS = new Set((process.env.PREMIUM_CHAT_IDS || "").split(",").map(s => s.trim()).filter(Boolean));
const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT) || 1; // quantas vezes por dia usuários free podem usar /analise

const exchange = new ccxt.binance({ enableRateLimit: true });
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// mapa para controlar cooldown por par
const lastSignalTime = new Map();

// uso por usuário para /analise (resets diários)
const usageByChat = new Map(); // chatId -> { date: 'YYYY-MM-DD', count: number }

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

// ===== FUNÇÕES AUXILIARES =====
function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function isPremiumChat(chatId) {
  return PREMIUM_CHAT_IDS.has(String(chatId));
}

function checkAndConsumeUsage(chatId) {
  if (isPremiumChat(chatId)) return { allowed: true, remaining: Infinity };
  const today = todayStr();
  const rec = usageByChat.get(chatId) || { date: today, count: 0 };
  if (rec.date !== today) {
    rec.date = today;
    rec.count = 0;
  }
  if (rec.count >= FREE_DAILY_LIMIT) {
    usageByChat.set(chatId, rec);
    return { allowed: false, remaining: 0 };
  }
  rec.count += 1;
  usageByChat.set(chatId, rec);
  return { allowed: true, remaining: Math.max(0, FREE_DAILY_LIMIT - rec.count) };
}

function normalizeSymbol(input) {
  // aceita btcusdt, btc/usdt, BTCUSDT -> converte para BTC/USDT
  if (!input || typeof input !== "string") return DEFAULT_SYMBOL;
  const s = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  // heurística: assume que os últimos 3 ou 4 chars são a stable (USDT, BTC, ETH...) - prioriza USDT se aparecer
  if (s.endsWith("USDT")) return `${s.slice(0, -4)}/USDT`;
  if (s.endsWith("BTC")) return `${s.slice(0, -3)}/BTC`;
  if (s.endsWith("ETH")) return `${s.slice(0, -3)}/ETH`;
  // fallback
  if (s.length >= 6) return `${s.slice(0, s.length - 4)}/${s.slice(-4)}`;
  return DEFAULT_SYMBOL;
}

// ===== INDICADORES =====
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

function macdSeries(closes, fast = MACD_FAST, slow = MACD_SLOW, signal = MACD_SIGNAL) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macd = closes.map((_, i) => (typeof emaFast[i] === "number" && typeof emaSlow[i] === "number" ? emaFast[i] - emaSlow[i] : null));
  const macdForSignal = macd.map(v => (v === null ? 0 : v));
  const signalLine = ema(macdForSignal, signal);
  const hist = macd.map((v, i) => (v === null || typeof signalLine[i] !== "number" ? null : v - signalLine[i]));
  return { macd, signalLine, hist };
}

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

function analyzeIndicators(df) {
  const i = df.length - 1;
  const last = df[i];
  const prev = df[i - 1] || {};

  if (!last || last.rsi === null || last.macd === null || last.macdSignal === null || last.volSma === null) return { side: "NEUTRO", reason: "Dados insuficientes" };

  const trendBull = last.ema50 !== null && last.ema200 !== null && last.ema50 > last.ema200;
  const trendBear = last.ema50 !== null && last.ema200 !== null && last.ema50 < last.ema200;

  const macdCrossoverUp = prev.macd !== null && prev.macdSignal !== null && prev.macd < prev.macdSignal && last.macd > last.macdSignal;
  const macdCrossoverDown = prev.macd !== null && prev.macdSignal !== null && prev.macd > prev.macdSignal && last.macd < last.macdSignal;

  const rsiBuy = last.rsi < RSI_MIN; // oversold
  const rsiSell = last.rsi > RSI_MAX; // overbought

  const volumeOk = last.volume && last.volSma && last.volume > last.volSma * 0.8;

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

  const minConfirms = 2;

  if (confirmationsBuy >= minConfirms && volumeOk) {
    return { side: "COMPRA", reason: "Multi-confirmation BUY", details: { confirmationsBuy, rsi: last.rsi, macd: last.macd, ema50: last.ema50, ema200: last.ema200 } };
  }
  if (confirmationsSell >= minConfirms && volumeOk) {
    return { side: "VENDA", reason: "Multi-confirmation SELL", details: { confirmationsSell, rsi: last.rsi, macd: last.macd, ema50: last.ema50, ema200: last.ema200 } };
  }

  return { side: "NEUTRO", reason: "Sem confirmações suficientes" };
}

// ===== LOOP AUTOMÁTICO =====
async function autoLoop() {
  try {
    const df = await getOHLCV(DEFAULT_SYMBOL, 500);
    if (!Array.isArray(df) || df.length === 0) {
      console.warn("autoLoop: dados inválidos de OHLCV, pulando execução.");
      return;
    }
    const withIndicators = calculateIndicators(df);
    const last = withIndicators[withIndicators.length - 1];
    const signalObj = analyzeIndicators(withIndicators);

    console.log(
      `[${new Date().toISOString()}] ${DEFAULT_SYMBOL} close=${last.close} rsi=${last.rsi} macd=${last.macd} ema50=${last.ema50} ema200=${last.ema200} signal=${signalObj ? signalObj.side : 'N/A'} `
    );

    if (signalObj && signalObj.side && signalObj.side !== "NEUTRO") {
      const price = last.close;
      const msg = `🚨 SINAL ${signalObj.side}\nPar: ${DEFAULT_SYMBOL}\n💰 Preço: ${price}\nRSI: ${last.rsi !== null ? last.rsi.toFixed(2) : "N/A"}\nMotivo: ${signalObj.reason}`;
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

autoLoop().catch((e) => console.error("Erro no primeiro run do autoLoop:", e?.message ?? e));
setInterval(autoLoop, 60 * 1000);

// ===== COMANDOS MANUAIS E /analise =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🤖 Olá! Eu sou seu bot de sinais.\n\nUse:\n`/analise BTCUSDT` → analisa uma moeda (premium ilimitado; free 1x/dia)\n`/status` → mostra o que estou monitorando.",
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id, `Atualmente monitorando: ${DEFAULT_SYMBOL} no timeframe ${TIMEFRAME}`);
});

bot.onText(/\/signal (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  try {
    const df = await getOHLCV(symbol, 500);
    const withIndicators = calculateIndicators(df);
    const signal = analyzeIndicators(withIndicators);
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

bot.onText(/\/analise\s+(.+)/i, async (msg, match) => {
  const raw = match[1];
  const chatId = String(msg.chat.id);
  const symbol = normalizeSymbol(raw);

  // limita uso para free
  const usage = checkAndConsumeUsage(chatId);
  if (!usage.allowed) {
    bot.sendMessage(chatId, `⚠️ Limite diário atingido. Usuários grátis só podem usar /analise ${FREE_DAILY_LIMIT} vez(es) por dia. Considere assinar o plano Premium.`);
    return;
  }

  try {
    const df = await getOHLCV(symbol, 500);
    const withIndicators = calculateIndicators(df);
    const signal = analyzeIndicators(withIndicators);
    const last = withIndicators[withIndicators.length - 1];
    const price = last.close;
    const rsi = last.rsi !== null ? last.rsi.toFixed(2) : "N/A";
    let msgText = `📊 Análise de ${symbol}\n💰 Preço: ${price}\nRSI: ${rsi}\nSinal: ${signal.side}`;
    if (signal.side !== "NEUTRO" && signal.details) {
      msgText += `\nMotivo: ${signal.reason} (confirmações: ${signal.details.confirmationsBuy ?? signal.details.confirmationsSell ?? 'N/A'})`;
    } else {
      msgText += `\nMotivo: ${signal.reason}`;
    }
    if (!isPremiumChat(chatId)) {
      msgText += `\n\nVocê está usando a versão gratuita — ${Math.max(0, usage.remaining)} consulta(s) restante(s) hoje.`;
    } else {
      msgText += `\n\nPlano: PREMIUM (consultas ilimitadas)`;
    }
    bot.sendMessage(chatId, msgText);
  } catch (e) {
    console.error("Erro ao processar /analise:", e);
    bot.sendMessage(chatId, `Erro ao analisar ${symbol}: ${e?.message ?? e}`);
  }
});

// Comando simples para admins adicionarem/removerem premium via chat (opcional)
bot.onText(/\/premium_add (.+)/, (msg, match) => {
  // cuidado: este comando permite adicionar chat IDs ao env list em runtime (apenas em memória)
  const target = String((match[1] || "").trim());
  if (!target) return bot.sendMessage(msg.chat.id, "Uso: /premium_add <chatId>");
  PREMIUM_CHAT_IDS.add(target);
  bot.sendMessage(msg.chat.id, `Chat ${target} adicionado à lista PREMIUM em memória.`);
});
bot.onText(/\/premium_remove (.+)/, (msg, match) => {
  const target = String((match[1] || "").trim());
  if (!target) return bot.sendMessage(msg.chat.id, "Uso: /premium_remove <chatId>");
  PREMIUM_CHAT_IDS.delete(target);
  bot.sendMessage(msg.chat.id, `Chat ${target} removido da lista PREMIUM em memória.`);
});