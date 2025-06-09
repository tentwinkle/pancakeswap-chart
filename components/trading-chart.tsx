"use client"

import { useEffect, useRef, useState } from "react"
import Highcharts from "highcharts/highstock"
import HighchartsReact from "highcharts-react-official"
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

// Format number with commas and specified decimal places
function formatNumber(num: number, decimals = 2): string {
  if (num === undefined || num === null || isNaN(num)) return "N/A"
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Format currency with $ sign
function formatCurrency(num: number, decimals = 2): string {
  if (num === undefined || num === null || isNaN(num)) return "N/A"
  if (num === 0) return "$0.00"

  // For very small numbers, use more decimals
  if (Math.abs(num) < 0.01) {
    return "$" + num.toFixed(6)
  }

  return "$" + formatNumber(num, decimals)
}

export default function TradingChart() {
  const chartRef = useRef<HighchartsReact.RefObject>(null)

  const [pairs, setPairs] = useState<TradingPair[]>([])
  const [selectedPair, setSelectedPair] = useState<string>("")
  const [selectedInterval, setSelectedInterval] = useState<string>("1m")
  const [loading, setLoading] = useState(true)
  const [pairStats, setPairStats] = useState<PairStats | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
  const [debugInfo, setDebugInfo] = useState({ seriesCount: 0, ohlcPoints: 0, volumePoints: 0 })

  const [chartOptions, setChartOptions] = useState<Highcharts.Options>({
    accessibility: {
      enabled: false,
    },
    chart: {
      backgroundColor: "transparent",
      height: 500,
      style: {
        fontFamily: "inherit",
      },
    },
    credits: {
      enabled: false,
    },
    rangeSelector: {
      enabled: false,
    },
    navigator: {
      enabled: false,
    },
    scrollbar: {
      enabled: false,
    },
    title: {
      text: undefined,
    },
    xAxis: {
      type: "datetime",
      lineColor: "#374151",
      tickColor: "#374151",
      labels: {
        style: {
          color: "#d1d5db",
        },
      },
    },
    yAxis: [
      {
        labels: {
          align: "right",
          style: {
            color: "#d1d5db",
          },
        },
        title: {
          text: "Price",
          style: {
            color: "#d1d5db",
          },
        },
        height: "70%",
        lineWidth: 1,
        gridLineColor: "#374151",
      },
      {
        labels: {
          align: "right",
          style: {
            color: "#d1d5db",
          },
        },
        title: {
          text: "Volume",
          style: {
            color: "#d1d5db",
          },
        },
        top: "72%",
        height: "28%",
        offset: 0,
        lineWidth: 1,
        gridLineColor: "#374151",
      },
    ],
    tooltip: {
      split: true,
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      style: {
        color: "#ffffff",
      },
    },
    plotOptions: {
      candlestick: {
        upColor: "#10b981",
        color: "#ef4444",
        lineColor: "#ef4444",
        upLineColor: "#10b981",
      },
      column: {
        borderWidth: 0,
      },
    },
    series: [],
  })

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

        console.log("Fetched data:", data) // Debug log

        // Format data for Highcharts
        const ohlcData = data.candles.map((candle: any) => [
          candle.time * 1000, // Convert to milliseconds
          candle.open,
          candle.high,
          candle.low,
          candle.close,
        ])

        const volumeData = data.volume.map((vol: any) => ({
          x: vol.time * 1000, // Convert to milliseconds
          y: vol.value,
          color: vol.color || "#6b7280",
        }))

        console.log("OHLC Data:", ohlcData.slice(0, 3)) // Debug log
        console.log("Volume Data:", volumeData.slice(0, 3)) // Debug log

        const newSeries = [
          {
            type: "candlestick" as const,
            name: "Price",
            id: "price",
            data: ohlcData,
            yAxis: 0,
          },
          {
            type: "column" as const,
            name: "Volume",
            id: "volume",
            data: volumeData,
            yAxis: 1,
          },
        ]

        setChartOptions((prevOptions) => ({
          ...prevOptions,
          series: newSeries,
        }))

        setDebugInfo({
          seriesCount: newSeries.length,
          ohlcPoints: ohlcData.length,
          volumePoints: volumeData.length,
        })

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

    let eventSource: EventSource | null = null

    const createEventSource = () => {
      if (eventSource) {
        eventSource.close()
      }

      eventSource = new EventSource(`/api/stream?pair=${selectedPair}&interval=${selectedInterval}`)

      eventSource.onopen = () => {
        setConnectionStatus("connected")
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const chart = chartRef.current?.chart

          if (!chart) return

          console.log("Received real-time data:", data) // Debug log

          if (data.type === "candle") {
            const series = chart.get("price") as Highcharts.Series
            if (series && data.candle) {
              const timestamp = data.candle.time * 1000

              // Find existing point or determine if we need to add a new one
              const existingPoint = series.data.find((point) => point.x === timestamp)

              const newPoint = [timestamp, data.candle.open, data.candle.high, data.candle.low, data.candle.close]

              if (existingPoint) {
                // Update existing point
                existingPoint.update(newPoint, true, false)
              } else {
                // Add new point and keep only last 200 points
                series.addPoint(newPoint, true, series.data.length >= 200)
              }
            }
          }

          if (data.type === "volume") {
            const series = chart.get("volume") as Highcharts.Series
            if (series && data.volume) {
              const timestamp = data.volume.time * 1000

              // Find existing point
              const existingPoint = series.data.find((point) => point.x === timestamp)

              const newPoint = {
                x: timestamp,
                y: data.volume.value,
                color: data.volume.color || "#6b7280",
              }

              if (existingPoint) {
                // Update existing point
                existingPoint.update(newPoint, true, false)
              } else {
                // Add new point and keep only last 200 points
                series.addPoint(newPoint, true, series.data.length >= 200)
              }
            }
          }

          if (data.type === "stats") {
            setPairStats((prev) => {
              if (!prev) return data.stats
              return {
                ...prev,
                ...data.stats,
              }
            })
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
          createEventSource()
        }, 5000)
      }
    }
    createEventSource()

    return () => {
      if (eventSource) {
        eventSource.close()
      }
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
                {pairStats.lastPrice > 0 ? formatCurrency(pairStats.lastPrice, 6) : "Loading..."}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">24h Change</div>
              <div
                className={`text-lg font-semibold flex items-center gap-1 ${
                  pairStats.change24h >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {pairStats.change24h >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {Math.abs(pairStats.change24h) > 0 ? `${formatNumber(pairStats.change24h, 2)}%` : "0.00%"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">24h Volume</div>
              <div className="text-lg font-semibold">
                {pairStats.volume24h > 0 ? formatCurrency(pairStats.volume24h, 2) : "$0.00"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Market Cap</div>
              <div className="text-lg font-semibold">
                {pairStats.marketCap > 0 ? formatCurrency(pairStats.marketCap, 2) : "N/A"}
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
          {loading ? (
            <div className="h-[500px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <HighchartsReact
              highcharts={Highcharts}
              constructorType="stockChart"
              options={chartOptions}
              ref={chartRef}
            />
          )}
        </CardContent>
      </Card>

      {/* Debug Info */}
      <div className="mt-2 text-xs text-muted-foreground">
        Debug: Chart has {debugInfo.seriesCount} series, OHLC points: {debugInfo.ohlcPoints}, Volume points:{" "}
        {debugInfo.volumePoints}
      </div>
    </div>
  )
}
