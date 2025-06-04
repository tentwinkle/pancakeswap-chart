import type { NextRequest } from "next/server"
import { candleAggregator } from "@/lib/candle-aggregator"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const pair = searchParams.get("pair")
  const interval = searchParams.get("interval")

  if (!pair || !interval) {
    return new Response("Missing pair or interval", { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const data = `data: ${JSON.stringify({ type: "connected", pair, interval })}\n\n`
      controller.enqueue(encoder.encode(data))

      // Simulate real-time data updates
      const intervalId = setInterval(() => {
        try {
          // Generate mock swap event
          const mockPrice = 100 + Math.random() * 900
          const mockVolume = Math.random() * 10000

          // Add to aggregator
          candleAggregator.addSwapEvent(
            {
              timestamp: Date.now(),
              price: mockPrice,
              volume: mockVolume,
              pair,
            },
            interval,
          )

          // Get latest candle and volume
          const latestCandle = candleAggregator.getLatestCandle(pair, interval)
          const latestVolume = candleAggregator.getLatestVolume(pair, interval)

          if (latestCandle) {
            const candleData = `data: ${JSON.stringify({
              type: "candle",
              candle: latestCandle,
            })}\n\n`
            controller.enqueue(encoder.encode(candleData))
          }

          if (latestVolume) {
            const volumeData = `data: ${JSON.stringify({
              type: "volume",
              volume: latestVolume,
            })}\n\n`
            controller.enqueue(encoder.encode(volumeData))
          }

          // Send updated stats
          const statsData = `data: ${JSON.stringify({
            type: "stats",
            stats: {
              lastPrice: mockPrice,
              change24h: (Math.random() - 0.5) * 10,
              volume24h: Math.random() * 10000000,
              marketCap: Math.random() * 1000000000,
            },
          })}\n\n`
          controller.enqueue(encoder.encode(statsData))
        } catch (error) {
          console.error("Stream error:", error)
        }
      }, 5000) // Update every 5 seconds

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
