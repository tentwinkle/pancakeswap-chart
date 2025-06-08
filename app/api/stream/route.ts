import type { NextRequest } from "next/server"
import { candleAggregator } from "@/lib/candle-aggregator"
import { createWsProvider, createPairContract } from "@/lib/pancakeswap"
import type { ethers } from "ethers"

// Ensure this route runs in a Node.js environment as it relies on the `ws`
// package which is not compatible with the Edge runtime.
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const pair = searchParams.get("pair")
  const interval = searchParams.get("interval")

  if (!pair || !interval) {
    return new Response("Missing pair or interval", { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const data = `data: ${JSON.stringify({
        type: "connected",
        pair,
        interval,
      })}\n\n`
      controller.enqueue(encoder.encode(data))

      const wsProvider = createWsProvider()
      const pairContract = createPairContract(pair, wsProvider)

      const handleSwap = async (
        sender: string,
        amount0In: ethers.BigNumberish,
        amount1In: ethers.BigNumberish,
        amount0Out: ethers.BigNumberish,
        amount1Out: ethers.BigNumberish,
        to: string,
        event: any,
      ) => {
        try {
          const price =
            Number(amount1In) > 0
              ? Number(amount0Out) / Number(amount1In)
              : Number(amount1Out) > 0
                ? Number(amount0In) / Number(amount1Out)
                : 0

          // Calculate volume with proper scaling to match historical data
          const volume = Math.abs(Number(amount1In) - Number(amount1Out)) / 100000 // Scale down to match historical

          const block = await wsProvider.getBlock(event.blockNumber)
          candleAggregator.addSwapEvent(
            {
              timestamp: block!.timestamp * 1000,
              price,
              volume,
              pair,
            },
            interval,
          )

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
            // Determine color based on candle direction
            const volumeColor = latestCandle && latestCandle.close > latestCandle.open ? "#10b981" : "#ef4444"

            const volumeData = `data: ${JSON.stringify({
              type: "volume",
              volume: {
                ...latestVolume,
                color: volumeColor,
              },
            })}\n\n`
            controller.enqueue(encoder.encode(volumeData))
          }

          const statsData = `data: ${JSON.stringify({
            type: "stats",
            stats: {
              lastPrice: price,
              volume24h: latestVolume?.value ?? 0,
            },
          })}\n\n`
          controller.enqueue(encoder.encode(statsData))
        } catch (err) {
          console.error("Swap event error", err)
        }
      }

      pairContract.on("Swap", handleSwap)

      request.signal.addEventListener("abort", () => {
        pairContract.off("Swap", handleSwap)
        wsProvider.destroy()
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
