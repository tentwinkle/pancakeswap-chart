import type { NextRequest } from "next/server"
import { candleAggregator } from "@/lib/candle-aggregator"
import { createWsProvider, createPairContract, ERC20_ABI } from "@/lib/pancakeswap"
import { ethers } from "ethers"

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
      let closed = false

      const [token0Addr, token1Addr] = await Promise.all([pairContract.token0(), pairContract.token1()])
      const token0 = new ethers.Contract(token0Addr, ERC20_ABI, wsProvider)
      const token1 = new ethers.Contract(token1Addr, ERC20_ABI, wsProvider)
      const [dec0Raw, dec1Raw] = await Promise.all([
        token0.decimals(),
        token1.decimals(),
      ])
      const dec0 = Number(dec0Raw)
      const dec1 = Number(dec1Raw)

      const handleSwap = async (
        sender: string,
        amount0In: ethers.BigNumberish,
        amount1In: ethers.BigNumberish,
        amount0Out: ethers.BigNumberish,
        amount1Out: ethers.BigNumberish,
        to: string,
        event: any,
      ) => {
        if (closed) return
        try {
          const a0In = Number(ethers.formatUnits(amount0In, dec0))
          const a1In = Number(ethers.formatUnits(amount1In, dec1))
          const a0Out = Number(ethers.formatUnits(amount0Out, dec0))
          const a1Out = Number(ethers.formatUnits(amount1Out, dec1))

          const price =
            a1In > 0
              ? a0Out / a1In
              : a1Out > 0
                ? a0In / a1Out
                : 0

          const volume = Math.abs(a1In - a1Out)

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
        closed = true
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
