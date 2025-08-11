# Overview

This is a cryptocurrency trading bot application that provides automated signal detection and monitoring for trading pairs (specifically XLM/USD). The system combines technical analysis indicators (MACD, RSI, volume analysis) with real-time market data to generate buy/sell signals and deliver notifications via Telegram integration.

The application features a modern React-based dashboard for real-time monitoring, configuration management, and bot control, backed by an Express.js server with WebSocket support for live updates. The system is designed as a full-stack trading assistant with comprehensive market analysis capabilities.

**Current Status (August 11, 2025)**: The application is fully operational with confirmed signal detection and Telegram delivery. The trading bot successfully detected and sent a BUY signal (XLM-USDT at $0.4442, RSI 51.4) with automatic Telegram notification. The system monitors every 30 seconds with proper cooldown periods, uses real Coinbase market data, and maintains persistent PostgreSQL storage. WebSocket dashboard updates provide real-time price, RSI, and MACD data visualization.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Radix UI primitives with shadcn/ui component library for consistent design
- **Styling**: Tailwind CSS with custom CSS variables for theming, supporting a dark trading-focused theme
- **State Management**: TanStack React Query for server state management and data fetching
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Updates**: WebSocket connection for live bot status and market data updates

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with WebSocket support for real-time communication
- **Market Data**: CCXT library for cryptocurrency exchange integration (Binance)
- **Technical Analysis**: Custom implementations of MACD, RSI, and volume moving averages
- **Background Processing**: Interval-based signal detection with configurable parameters

## Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Connection**: Neon Database serverless PostgreSQL hosting
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Storage Interface**: DatabaseStorage implementation with full PostgreSQL integration
- **Data Models**: Signals, market data, and configuration entities with proper relationships
- **Migration Status**: Successfully migrated from in-memory storage to PostgreSQL database (August 11, 2025)

## Authentication and Authorization
- **Session Management**: Express sessions with PostgreSQL session store
- **Security**: No complex authentication implemented - designed for single-user trading bot operation
- **Configuration Protection**: Environment-based sensitive data management

## External Service Integrations
- **Cryptocurrency Exchange**: Coinbase API via CCXT library for real-time market data and OHLCV fetching (switched from Binance for better reliability)
- **Notification Service**: Telegram Bot API for automatic signal alerts and notifications with detailed technical indicators
- **Chart Visualization**: TradingView embedded widgets for professional trading charts
- **Development Tools**: Replit-specific plugins for development environment integration
- **Real-time Updates**: WebSocket broadcasting for live dashboard updates every 30 seconds

## Key Design Patterns
- **Service Layer Pattern**: Separated business logic into distinct services (TradingBot, MarketData, Telegram)
- **Repository Pattern**: Abstracted data access through storage interface
- **Observer Pattern**: WebSocket broadcasting for real-time updates to connected clients
- **Configuration Management**: Centralized bot parameters with real-time updates
- **Error Handling**: Comprehensive error boundaries and graceful failure handling

## Technical Indicators Implementation
- **MACD (Moving Average Convergence Divergence)**: Configurable fast/slow/signal periods for trend analysis
- **RSI (Relative Strength Index)**: Momentum oscillator with configurable periods and thresholds
- **Volume Analysis**: Moving average comparison for volume confirmation
- **Signal Generation**: Multi-indicator confirmation system with cooldown periods

# External Dependencies

## Core Technologies
- **Node.js Runtime**: JavaScript runtime for server execution
- **PostgreSQL Database**: Primary data storage via Neon Database serverless platform
- **Binance API**: Cryptocurrency market data source through CCXT library

## Frontend Dependencies
- **React & TypeScript**: UI framework with type safety
- **Vite**: Modern build tool and development server
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Headless UI component primitives
- **TanStack React Query**: Server state management
- **Wouter**: Lightweight routing solution

## Backend Dependencies
- **Express.js**: Web framework for API and WebSocket server
- **Drizzle ORM**: Type-safe database toolkit
- **CCXT**: Cryptocurrency trading library for exchange connectivity
- **WebSocket (ws)**: Real-time bidirectional communication
- **Axios**: HTTP client for external API calls

## External APIs
- **Binance Exchange API**: Market data, OHLCV, and trading pair information
- **Telegram Bot API**: Message delivery and notification system
- **TradingView Widgets**: Professional charting and technical analysis visualization

## Development Tools
- **TypeScript**: Static type checking across the entire stack
- **ESBuild**: Fast JavaScript bundler for production builds
- **Replit Environment**: Cloud-based development platform with specific tooling