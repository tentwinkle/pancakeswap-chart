# PancakeSwap Candlestick Chart

This sample app demonstrates a real-time candlestick chart built with **Next.js 14** using the App Router. Data is retrieved from PancakeSwap on BNB Chain. The frontend uses TradingView's `lightweight-charts` library and updates via Server-Sent Events.

## Features

- Fetches the top 20 trading pairs from PancakeSwap using The Graph.
- Streams live `Swap` events from pair contracts via WebSockets.
- Aggregates trades into OHLCV candles for multiple timeframes.
- Mobile-friendly UI built with Tailwind CSS.

## Project Structure

- `app/` – Next.js route handlers and pages. `app/api` exposes the `/api/*` endpoints.
- `components/` – React components including `trading-chart.tsx` and various UI primitives.
- `lib/` – Server-side utilities for interacting with PancakeSwap and aggregating candles.
- `hooks/` – Custom React hooks used by the frontend.
- `types/` – TypeScript interfaces shared across the project.

## Data Flow

1. `/api/pairs` fetches the top pairs from The Graph via `fetchTopPairs` in `lib/pancakeswap.ts`.
2. `/api/candles` combines historical candles from The Graph with real‑time data produced by the `CandleAggregator`.
3. `/api/stream` streams live updates using Server‑Sent Events. Swap events are read from pair contracts over WebSockets and turned into candles which are pushed down to the client.

### Candle Aggregation

`lib/candle-aggregator.ts` maintains per‑pair maps of OHLC and volume data. Each swap event is bucketed by interval and updates the open, high, low, close and volume fields. Consumers can query the latest candle or get historical arrays for charting.

### UI Overview

The homepage displays a trading pair selector, a time‑interval dropdown and a candlestick chart powered by TradingView’s `lightweight-charts`. The chart updates in real time via the `/api/stream` endpoint using Server‑Sent Events.

## Setup

1. Create a `.env` file in the project root and supply the following variables:

   - `PANCAKESWAP_SUBGRAPH_URL` – The Graph endpoint for PancakeSwap.
   - `BNB_RPC_URL` – HTTP RPC provider URL.
   - `BNB_WS_URL` – WebSocket RPC provider URL.

2. Install dependencies and start the dev server:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` in your browser.

> **Note**: Connecting to the BNB Chain requires WebSocket access. Ensure your environment allows outbound network connections. If running in a restricted environment the real-time stream may fail.
