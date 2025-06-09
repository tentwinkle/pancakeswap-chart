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
    const intervalMs = getIntervalMs(interval)
    const candlesPerDay = Math.floor((24 * 60 * 60 * 1000) / intervalMs)
    const limit = Math.max(200, candlesPerDay)

    // Fetch historical candles and volumes
    const { candles: historicalCandles, volumes: historicalVolumes } = await fetchHistoricalCandles(pair, interval, limit)

    // Get real-time candles from aggregator
    const realtimeCandles = candleAggregator.getCandles(pair, interval, limit)

    // Combine historical and real-time data
    const combinedCandles = [...historicalCandles, ...realtimeCandles].sort((a, b) => a.time - b.time)

    // Generate volume data (simplified)
    const realtimeVolumes = candleAggregator.getVolumes(pair, interval, limit)
    const volumeMap: Record<number, number> = {}
    for (const vol of historicalVolumes) {
      volumeMap[vol.time] = vol.value
    }
    for (const vol of realtimeVolumes) {
      volumeMap[vol.time] = (volumeMap[vol.time] || 0) + vol.value
    }
    const volumeDataFull = combinedCandles.map((candle) => ({
      time: candle.time,
      value: volumeMap[candle.time] || 0,
      color: candle.close > candle.open ? "#10b981" : "#ef4444",
    }))

    const slicedCandles = combinedCandles.slice(-200)
    const slicedVolume = volumeDataFull.slice(-200)

    // Get current price and pair info
    const [currentPrice, pairInfo] = await Promise.all([fetchPairPrice(pair), fetchPairInfo(pair)])

    // Calculate stats
    // Use current price if available, otherwise use last candle close
    const actualLastPrice = currentPrice > 0 ? currentPrice : combinedCandles[combinedCandles.length - 1]?.close || 0

    // Calculate 24h change - find candle from 24 hours ago
    let change24h = 0
    if (combinedCandles.length > 0) {
      // Find the candle closest to 24 hours ago
      const oldestCandle =
        combinedCandles.length > candlesPerDay ? combinedCandles[combinedCandles.length - candlesPerDay] : combinedCandles[0]
      if (oldestCandle && actualLastPrice > 0) {
        change24h = ((actualLastPrice - oldestCandle.open) / oldestCandle.open) * 100
      }
    }

    // Calculate volume over the last 24 hours
    const volume24h = volumeDataFull.slice(-candlesPerDay).reduce((acc, v) => acc + v.value, 0)

    // Calculate market cap using pair info
    let marketCap = 0
    if (pairInfo) {
      // Use reserveUSD as a proxy for market cap
      marketCap = Number.parseFloat(pairInfo.reserveUSD || "0")

      // If token0 is the base token, use its total liquidity * price
      if (pairInfo.token0 && pairInfo.token0.totalLiquidity) {
        const totalSupply = Number.parseFloat(pairInfo.token0.totalLiquidity)
        marketCap = totalSupply * actualLastPrice
      }
    }

    const stats: PairStats = {
      lastPrice: actualLastPrice,
      change24h,
      volume24h,
      marketCap,
    }

    return NextResponse.json({
      candles: slicedCandles,
      volume: slicedVolume,
      stats,
    })
  } catch (error) {
    console.error("Error fetching candles:", error)
    return NextResponse.json({ error: "Failed to fetch candles" }, { status: 500 })
  }
}
