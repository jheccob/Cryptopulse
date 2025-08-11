import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, real, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  type: text("type").notNull(), // 'BUY' or 'SELL'
  price: real("price").notNull(),
  rsi: real("rsi").notNull(),
  macd: real("macd").notNull(),
  macdSignal: real("macd_signal").notNull(),
  volume: real("volume").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  telegramSent: boolean("telegram_sent").default(false),
});

export const marketData = pgTable("market_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: real("volume").notNull(),
  rsi: real("rsi"),
  macd: real("macd"),
  macdSignal: real("macd_signal"),
  macdHistogram: real("macd_histogram"),
});

export const configurations = pgTable("configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull().default('XLM/USDT'),
  timeframe: text("timeframe").notNull().default('5m'),
  macdFast: integer("macd_fast").notNull().default(8),
  macdSlow: integer("macd_slow").notNull().default(17),
  macdSignal: integer("macd_signal").notNull().default(9),
  rsiPeriod: integer("rsi_period").notNull().default(14),
  rsiLower: integer("rsi_lower").notNull().default(20),
  rsiUpper: integer("rsi_upper").notNull().default(80),
  volumePeriod: integer("volume_period").notNull().default(20),
  alertCooldown: integer("alert_cooldown").notNull().default(5),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
  telegramToken: text("telegram_token"),
  telegramChatId: text("telegram_chat_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  timestamp: true,
  telegramSent: true,
});

export const insertMarketDataSchema = createInsertSchema(marketData).omit({
  id: true,
});

export const insertConfigurationSchema = createInsertSchema(configurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateConfigurationSchema = insertConfigurationSchema.partial();

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type MarketData = typeof marketData.$inferSelect;
export type InsertMarketData = z.infer<typeof insertMarketDataSchema>;
export type Configuration = typeof configurations.$inferSelect;
export type InsertConfiguration = z.infer<typeof insertConfigurationSchema>;
export type UpdateConfiguration = z.infer<typeof updateConfigurationSchema>;

export interface WebSocketMessage {
  type: 'MARKET_DATA' | 'SIGNAL' | 'CONFIG_UPDATE' | 'BOT_STATUS';
  data: any;
  timestamp: string;
}

export interface BotStatus {
  isRunning: boolean;
  lastSignal?: string;
  uptime: string;
  connectionStatus: {
    binance: boolean;
    telegram: boolean;
  };
  currentConfig: Configuration;
}
