import type { NextRequest } from "next/server"
import { candleAggregator } from "@/lib/candle-aggregator"
import { createWsProvider, createPairContract, ERC20_ABI, fetchPairInfo, getIntervalMs } from "@/lib/pancakeswap"
import { ethers } from "ethers"

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
      let closed = false

      const safeEnqueue = (data: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(data))
        } catch (err) {
          console.warn("Failed to enqueue; stream likely closed:", err)
          closed = true
        }
      }

      safeEnqueue(`data: ${JSON.stringify({ type: "connected", pair, interval })}\n\n`)

      const wsProvider = createWsProvider()
      const pairContract = createPairContract(pair, wsProvider)

      // Get pair info for market cap calculation
      const pairInfo = await fetchPairInfo(pair)

      const [token0Addr, token1Addr] = await Promise.all([pairContract.token0(), pairContract.token1()])
      const token0 = new ethers.Contract(token0Addr, ERC20_ABI, wsProvider)
      const token1 = new ethers.Contract(token1Addr, ERC20_ABI, wsProvider)
      const [dec0Raw, dec1Raw] = await Promise.all([token0.decimals(), token1.decimals()])
      const dec0 = Number(dec0Raw)
      const dec1 = Number(dec1Raw)

      let volume24h = 0
      const intervalMs = getIntervalMs(interval)
      const candlesPerDay = Math.floor((24 * 60 * 60 * 1000) / intervalMs)

      const initialVolumes = candleAggregator.getVolumes(pair, interval, candlesPerDay)
      volume24h = initialVolumes.reduce((acc, vol) => acc + vol.value, 0)

      const initialCandles = candleAggregator.getCandles(pair, interval, candlesPerDay)
      const initialPrice = initialCandles.length > 0 ? initialCandles[0].open : 0

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

          const price = a1In > 0 ? a0Out / a1In : a1Out > 0 ? a0In / a1Out : 0
          const volume = Math.abs(a1In - a1Out)

          const block = await wsProvider.getBlock(event.blockNumber)
          const timestamp = block!.timestamp * 1000

          console.log(`New swap event: price=${price}, volume=${volume}, timestamp=${timestamp}`)

          candleAggregator.addSwapEvent(
            {
              timestamp,
              price,
              volume,
              pair,
            },
            interval,
          )

          const latestCandle = candleAggregator.getLatestCandle(pair, interval)
          const latestVolume = candleAggregator.getLatestVolume(pair, interval)

          volume24h += volume

          let change24h = 0
          if (initialPrice > 0 && price > 0) {
            change24h = ((price - initialPrice) / initialPrice) * 100
          }

          let marketCap = 0
          if (pairInfo && pairInfo.token0 && pairInfo.token0.totalLiquidity) {
            const totalSupply = Number.parseFloat(pairInfo.token0.totalLiquidity)
            marketCap = totalSupply * price
          } else if (pairInfo) {
            marketCap = Number.parseFloat(pairInfo.reserveUSD || "0")
          }

          if (latestCandle) {
            safeEnqueue(`data: ${JSON.stringify({ type: "candle", candle: latestCandle })}\n\n`)
          }

          if (latestVolume) {
            const volumeColor = latestCandle && latestCandle.close > latestCandle.open ? "#10b981" : "#ef4444"
            safeEnqueue(
              `data: ${JSON.stringify({
                type: "volume",
                volume: {
                  ...latestVolume,
                  color: volumeColor,
                },
              })}\n\n`,
            )
          }

          safeEnqueue(
            `data: ${JSON.stringify({
              type: "stats",
              stats: {
                lastPrice: price,
                change24h: change24h,
                volume24h: volume24h,
                marketCap: marketCap,
              },
            })}\n\n`,
          )
        } catch (err) {
          console.error("Swap event error", err)
          closed = true
        }
      }

      pairContract.on("Swap", handleSwap)

      request.signal.addEventListener("abort", () => {
        pairContract.off("Swap", handleSwap)
        wsProvider.destroy()
        closed = true
        try {
          controller.close()
        } catch (e) {
          console.warn("Stream already closed on abort:", e)
        }
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
