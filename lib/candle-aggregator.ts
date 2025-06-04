import type { CandleData, VolumeData, SwapEvent } from "@/types/trading"
import { getIntervalMs } from "./pancakeswap"

export class CandleAggregator {
  private candles: Map<string, Map<number, CandleData>> = new Map()
  private volumes: Map<string, Map<number, VolumeData>> = new Map()

  constructor() {}

  addSwapEvent(event: SwapEvent, interval: string) {
    const intervalMs = getIntervalMs(interval)
    const candleTime = Math.floor(event.timestamp / intervalMs) * intervalMs
    const candleKey = `${event.pair}-${interval}`

    // Initialize maps if they don't exist
    if (!this.candles.has(candleKey)) {
      this.candles.set(candleKey, new Map())
    }
    if (!this.volumes.has(candleKey)) {
      this.volumes.set(candleKey, new Map())
    }

    const pairCandles = this.candles.get(candleKey)!
    const pairVolumes = this.volumes.get(candleKey)!

    // Update candle data
    const existingCandle = pairCandles.get(candleTime)
    if (existingCandle) {
      existingCandle.high = Math.max(existingCandle.high, event.price)
      existingCandle.low = Math.min(existingCandle.low, event.price)
      existingCandle.close = event.price
    } else {
      pairCandles.set(candleTime, {
        time: Math.floor(candleTime / 1000),
        open: event.price,
        high: event.price,
        low: event.price,
        close: event.price,
      })
    }

    // Update volume data
    const existingVolume = pairVolumes.get(candleTime)
    if (existingVolume) {
      existingVolume.value += event.volume
    } else {
      pairVolumes.set(candleTime, {
        time: Math.floor(candleTime / 1000),
        value: event.volume,
        color: "#6b7280",
      })
    }
  }

  getCandles(pair: string, interval: string, limit = 100): CandleData[] {
    const candleKey = `${pair}-${interval}`
    const pairCandles = this.candles.get(candleKey)

    if (!pairCandles) return []

    return Array.from(pairCandles.values())
      .sort((a, b) => a.time - b.time)
      .slice(-limit)
  }

  getVolumes(pair: string, interval: string, limit = 100): VolumeData[] {
    const candleKey = `${pair}-${interval}`
    const pairVolumes = this.volumes.get(candleKey)

    if (!pairVolumes) return []

    return Array.from(pairVolumes.values())
      .sort((a, b) => a.time - b.time)
      .slice(-limit)
  }

  getLatestCandle(pair: string, interval: string): CandleData | null {
    const candles = this.getCandles(pair, interval, 1)
    return candles.length > 0 ? candles[0] : null
  }

  getLatestVolume(pair: string, interval: string): VolumeData | null {
    const volumes = this.getVolumes(pair, interval, 1)
    return volumes.length > 0 ? volumes[0] : null
  }
}

// Global aggregator instance
export const candleAggregator = new CandleAggregator()
