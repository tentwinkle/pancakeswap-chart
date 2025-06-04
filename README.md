# PancakeSwap Candlestick Chart

This sample app demonstrates a real-time candlestick chart built with **Next.js 14** using the App Router. Data is retrieved from PancakeSwap on BNB Chain. The frontend uses TradingView's `lightweight-charts` library and updates via Server-Sent Events.

## Features

- Fetches the top 20 trading pairs from PancakeSwap using The Graph.
- Streams live `Swap` events from pair contracts via WebSockets.
- Aggregates trades into OHLCV candles for multiple timeframes.
- Mobile-friendly UI built with Tailwind CSS.

## Setup

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` in your browser.

> **Note**: Connecting to the BNB Chain requires WebSocket access. Ensure your environment allows outbound network connections. If running in a restricted environment the real-time stream may fail.
