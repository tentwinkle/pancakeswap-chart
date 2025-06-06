"use client"

import { useEffect, useRef, useState } from "react"
import type { IChartApi, ISeriesApi } from "lightweight-charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, TrendingUp, TrendingDown } from "lucide-react"
import type { TradingPair, PairStats } from "@/types/trading"

const TIME_INTERVALS = [
  { value: "1m", label: "1 Minute" },
  { value: "5m", label: "5 Minutes" },
  { value: "15m", label: "15 Minutes" },
]

export default function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)

  const [pairs, setPairs] = useState<TradingPair[]>([])
  const [selectedPair, setSelectedPair] = useState<string>("")
  const [selectedInterval, setSelectedInterval] = useState<string>("1m")
  const [loading, setLoading] = useState(true)
  const [pairStats, setPairStats] = useState<PairStats | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    let mounted = true
    let chart: IChartApi | null = null

    import("lightweight-charts").then(({ createChart }) => {
      if (!mounted || !chartContainerRef.current) return

      chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 500,
        layout: {
          background: { color: "transparent" },
          textColor: "#d1d5db",
        },
        grid: {
          vertLines: { color: "#374151" },
          horzLines: { color: "#374151" },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: "#4b5563",
        },
        timeScale: {
          borderColor: "#4b5563",
          timeVisible: true,
          secondsVisible: false,
        },
      })

      const candlestickSeries = (chart as any).addCandlestickSeries({
        upColor: "#10b981",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#10b981",
        wickDownColor: "#ef4444",
        wickUpColor: "#10b981",
      })

      const volumeSeries = (chart as any).addHistogramSeries({
        color: "#6b7280",
        priceFormat: {
          type: "volume",
        },
        priceScaleId: "",
        scaleMargins: {
          top: 0.5,
          bottom: 0,
        },
      })

      chartRef.current = chart
      candlestickSeriesRef.current = candlestickSeries
      volumeSeriesRef.current = volumeSeries
    })

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener("resize", handleResize)

    return () => {
      mounted = false
      window.removeEventListener("resize", handleResize)
      if (chart) chart.remove()
    }
  }, [])

  // Fetch trading pairs
  useEffect(() => {
    const fetchPairs = async () => {
      try {
        const response = await fetch("/api/pairs")
        const data = await response.json()
        setPairs(data.pairs)
        if (data.pairs.length > 0) {
          setSelectedPair(data.pairs[0].address)
        }
      } catch (error) {
        console.error("Failed to fetch pairs:", error)
      }
    }

    fetchPairs()
  }, [])

  // Fetch candle data when pair or interval changes
  useEffect(() => {
    if (!selectedPair || !selectedInterval) return

    const fetchCandles = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/candles?pair=${selectedPair}&interval=${selectedInterval}`)
        const data = await response.json()

        if (candlestickSeriesRef.current && volumeSeriesRef.current) {
          candlestickSeriesRef.current.setData(data.candles)
          volumeSeriesRef.current.setData(data.volume)
        }

        setPairStats(data.stats)
      } catch (error) {
        console.error("Failed to fetch candles:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCandles()
  }, [selectedPair, selectedInterval])

  // Setup real-time streaming
  useEffect(() => {
    if (!selectedPair || !selectedInterval) return

    const eventSource = new EventSource(`/api/stream?pair=${selectedPair}&interval=${selectedInterval}`)

    eventSource.onopen = () => {
      setConnectionStatus("connected")
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === "candle" && candlestickSeriesRef.current) {
          candlestickSeriesRef.current.update(data.candle)
        }

        if (data.type === "volume" && volumeSeriesRef.current) {
          volumeSeriesRef.current.update(data.volume)
        }

        if (data.type === "stats") {
          setPairStats(data.stats)
        }
      } catch (error) {
        console.error("Failed to parse stream data:", error)
      }
    }

    eventSource.onerror = () => {
      setConnectionStatus("disconnected")
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        setConnectionStatus("connecting")
      }, 5000)
    }

    return () => {
      eventSource.close()
    }
  }, [selectedPair, selectedInterval])

  const selectedPairData = pairs.find((p) => p.address === selectedPair)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Trading Pair</label>
            <Select value={selectedPair} onValueChange={setSelectedPair}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select pair" />
              </SelectTrigger>
              <SelectContent>
                {pairs.map((pair) => (
                  <SelectItem key={pair.address} value={pair.address}>
                    {pair.token0Symbol}/{pair.token1Symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Time Interval</label>
            <Select value={selectedInterval} onValueChange={setSelectedInterval}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_INTERVALS.map((interval) => (
                  <SelectItem key={interval.value} value={interval.value}>
                    {interval.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={connectionStatus === "connected" ? "default" : "secondary"}>
            {connectionStatus === "connected" && <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />}
            {connectionStatus === "connecting" && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
            {connectionStatus}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      {pairStats && selectedPairData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Last Price</div>
              <div className="text-lg font-semibold">
                {pairStats.lastPrice > 0 ? `$${pairStats.lastPrice.toFixed(6)}` : "Loading..."}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">24h Change</div>
              <div
                className={`text-lg font-semibold flex items-center gap-1 ${pairStats.change24h >= 0 ? "text-green-500" : "text-red-500"
                  }`}
              >
                {pairStats.change24h >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {Math.abs(pairStats.change24h) > 0 ? `${pairStats.change24h.toFixed(2)}%` : "N/A"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">24h Volume</div>
              <div className="text-lg font-semibold">
                {pairStats.volume24h > 0 ? `$${pairStats.volume24h.toLocaleString()}` : "N/A"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Market Cap</div>
              <div className="text-lg font-semibold">
                {pairStats.marketCap > 0 ? `$${pairStats.marketCap.toLocaleString()}` : "N/A"}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {selectedPairData ? `${selectedPairData.token0Symbol}/${selectedPairData.token1Symbol}` : "Loading..."}
            </span>
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={chartContainerRef} className="w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
