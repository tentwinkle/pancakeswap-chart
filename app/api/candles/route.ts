import { type NextRequest, NextResponse } from "next/server"
import { fetchHistoricalCandles } from "@/lib/pancakeswap"
import { candleAggregator } from "@/lib/candle-aggregator"
import type { PairStats } from "@/types/trading"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const pair = searchParams.get("pair")
  const interval = searchParams.get("interval")

  if (!pair || !interval) {
    return NextResponse.json({ error: "Missing pair or interval" }, { status: 400 })
  }

  try {
    // Fetch historical candles
    const historicalCandles = await fetchHistoricalCandles(pair, interval)

    // Get real-time candles from aggregator
    const realtimeCandles = candleAggregator.getCandles(pair, interval)
    const realtimeVolumes = candleAggregator.getVolumes(pair, interval)

    // Combine historical and real-time data
    const allCandles = [...historicalCandles, ...realtimeCandles].sort((a, b) => a.time - b.time).slice(-200) // Keep last 200 candles

    // Generate volume data (simplified)
    const volumeData = allCandles.map((candle) => ({
      time: candle.time,
      value: Math.random() * 1000000, // Mock volume data
      color: candle.close > candle.open ? "#10b981" : "#ef4444",
    }))

    // Calculate stats
    const lastCandle = allCandles[allCandles.length - 1]
    const firstCandle = allCandles[Math.max(0, allCandles.length - 24)] // 24 periods ago

    const stats: PairStats = {
      lastPrice: lastCandle?.close || 0,
      change24h: firstCandle ? ((lastCandle.close - firstCandle.close) / firstCandle.close) * 100 : 0,
      volume24h: Math.random() * 10000000, // Mock 24h volume
      marketCap: Math.random() * 1000000000, // Mock market cap
    }

    return NextResponse.json({
      candles: allCandles,
      volume: volumeData,
      stats,
    })
  } catch (error) {
    console.error("Error fetching candles:", error)
    return NextResponse.json({ error: "Failed to fetch candles" }, { status: 500 })
  }
}
