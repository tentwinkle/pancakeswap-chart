import { type NextRequest, NextResponse } from "next/server"
import { fetchHistoricalCandles, fetchPairPrice, fetchPairInfo, getIntervalMs } from "@/lib/pancakeswap"
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
    // Fetch historical candles and volumes
    const { candles: historicalCandles, volumes: historicalVolumes } =
      await fetchHistoricalCandles(pair, interval)

    // Get real-time candles from aggregator
    const realtimeCandles = candleAggregator.getCandles(pair, interval)

    // Combine historical and real-time data
    const allCandles = [...historicalCandles, ...realtimeCandles].sort((a, b) => a.time - b.time).slice(-200) // Keep last 200 candles

    // Generate volume data (simplified)
    const realtimeVolumes = candleAggregator.getVolumes(pair, interval)
    const volumeMap: Record<number, number> = {}
    for (const vol of historicalVolumes) {
      volumeMap[vol.time] = vol.value
    }
    for (const vol of realtimeVolumes) {
      volumeMap[vol.time] = (volumeMap[vol.time] || 0) + vol.value
    }
    const volumeData = allCandles.map((candle) => ({
      time: candle.time,
      value: volumeMap[candle.time] || 0,
      color: candle.close > candle.open ? "#10b981" : "#ef4444",
    }))
    
    // Get current price and pair info
    const [currentPrice, pairInfo] = await Promise.all([fetchPairPrice(pair), fetchPairInfo(pair)])

    // Calculate stats
    const lastCandle = allCandles[allCandles.length - 1]
    const firstCandle = allCandles[0]
    
    // Use current price if available, otherwise use last candle close
    const actualLastPrice = currentPrice > 0 ? currentPrice : lastCandle?.close || 0

    // Calculate 24h change
    let change24h = 0
    if (firstCandle && actualLastPrice > 0) {
      change24h = ((actualLastPrice - firstCandle.open) / firstCandle.open) * 100
    }

    // Calculate volume over the last 24 hours based on interval
    const candlesPerDay = Math.floor((24 * 60 * 60 * 1000) / getIntervalMs(interval))
    const volume24h = volumeData
      .slice(-candlesPerDay)
      .reduce((acc, v) => acc + v.value, 0)

    // Calculate market cap (simplified - would need token supply data)
    const marketCap = pairInfo ? Number.parseFloat(pairInfo.reserveUSD) * 2 : 0 // Rough estimate

    const stats: PairStats = {
      lastPrice: actualLastPrice,
      change24h,
      volume24h,
      marketCap,
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
