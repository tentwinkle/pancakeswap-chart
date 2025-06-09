import { ethers } from "ethers"
import type { CandleData, VolumeData } from "@/types/trading"

// PancakeSwap V2 Factory and common addresses
export const PANCAKESWAP_V2_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"
export const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
export const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"

// The Graph endpoint for PancakeSwap
export const PANCAKESWAP_SUBGRAPH_URL = process.env.PANCAKESWAP_SUBGRAPH_URL!

// BNB Chain RPC
export const BNB_RPC_URL = process.env.BNB_RPC_URL!
export const BNB_WS_URL = process.env.BNB_WS_URL!

let _provider: ethers.JsonRpcProvider | null = null

export function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(BNB_RPC_URL)
  }
  return _provider
}

export function createWsProvider() {
  return new ethers.WebSocketProvider(BNB_WS_URL)
}

// PancakeSwap Pair ABI (minimal)
export const PAIR_ABI = [
  "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
]

// ERC20 ABI (minimal)
export const ERC20_ABI = [
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
]

export async function fetchTopPairs(): Promise<any[]> {
  const query = `
    {
      pairs(first: 20, orderBy: trackedReserveBNB, orderDirection: desc) {
        id
        token0 {
          id
          symbol
          decimals
        }
        token1 {
          id
          symbol
          decimals
        }
        volumeUSD
        reserveUSD
      }
    }
  `

  try {
    const response = await fetch(PANCAKESWAP_SUBGRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    })

    const data = await response.json()
    return data.data.pairs
  } catch (error) {
    console.error("Error fetching top pairs:", error)
    return []
  }
}

export async function fetchHistoricalCandles(
  pairAddress: string,
  interval: string,
  limit = 100,
): Promise<{ candles: CandleData[]; volumes: VolumeData[] }> {
  const intervalMs = getIntervalMs(interval)
  const endTime = Math.floor(Date.now() / 1000)
  const startTime = endTime - Math.floor((intervalMs * limit) / 1000)
  const infoQuery = `{
    pair(id: "${pairAddress}") {
      token0 { decimals }
      token1 { decimals }
    }
  }`

  const swapsQuery = `{
    swaps(first: 1000, orderBy: timestamp, orderDirection: asc, where: { pair: \"${pairAddress}\", timestamp_gt: ${startTime} }) {
      amount0In
      amount1In
      amount0Out
      amount1Out
      timestamp
    }
  }`

  try {
    const [infoRes, swapsRes] = await Promise.all([
      fetch(PANCAKESWAP_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: infoQuery }),
      }),
      fetch(PANCAKESWAP_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: swapsQuery }),
      }),
    ])
    const infoJson = await infoRes.json()
    const swapsJson = await swapsRes.json()
    const dec0 = Number(infoJson.data.pair.token0.decimals)
    const dec1 = Number(infoJson.data.pair.token1.decimals)
    const swaps = swapsJson.data.swaps as Array<any>

    const candles: CandleData[] = []
    const volumes: VolumeData[] = []
    const grouped: Record<number, any[]> = {}

    for (const swap of swaps) {
      const amount0In = Number(swap.amount0In) / 10 ** dec0
      const amount1In = Number(swap.amount1In) / 10 ** dec1
      const amount0Out = Number(swap.amount0Out) / 10 ** dec0
      const amount1Out = Number(swap.amount1Out) / 10 ** dec1

      const price = amount1In > 0 ? amount0Out / amount1In : amount0In / amount1Out

      const volume = Math.abs(amount1In - amount1Out)
      const bucket = Math.floor((Number(swap.timestamp) * 1000) / intervalMs) * intervalMs
      if (!grouped[bucket]) grouped[bucket] = []
      grouped[bucket].push({ price, volume, time: bucket })
    }

    const buckets = Object.keys(grouped).sort((a, b) => Number(a) - Number(b))

    for (const key of buckets) {
      const items = grouped[Number(key)]
      if (!items.length) continue
      const open = items[0].price
      const close = items[items.length - 1].price
      const high = Math.max(...items.map((i) => i.price))
      const low = Math.min(...items.map((i) => i.price))
      const volume = items.reduce((acc, i) => acc + i.volume, 0)
      const time = Math.floor(Number(key) / 1000)
      candles.push({ time, open, high, low, close })
      volumes.push({ time, value: volume, color: close > open ? "#10b981" : "#ef4444" })
    }

    return {
      candles: candles.slice(-limit),
      volumes: volumes.slice(-limit),
    }
  } catch (err) {
    console.error("Error fetching historical candles", err)
    return { candles: [], volumes: [] }
  }
}

export function getIntervalMs(interval: string): number {
  const intervals: Record<string, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
  }

  return intervals[interval] || intervals["1m"]
}

export function createPairContract(pairAddress: string, prov: ethers.Provider = getProvider()) {
  return new ethers.Contract(pairAddress, PAIR_ABI, prov)
}

export async function fetchPairPrice(pairAddress: string): Promise<number> {
  try {
    const pairContract = createPairContract(pairAddress)
    const [reserves, token0Addr, token1Addr] = await Promise.all([
      pairContract.getReserves(),
      pairContract.token0(),
      pairContract.token1(),
    ])

    const token0 = new ethers.Contract(token0Addr, ERC20_ABI, getProvider())
    const token1 = new ethers.Contract(token1Addr, ERC20_ABI, getProvider())
    const [dec0Raw, dec1Raw] = await Promise.all([token0.decimals(), token1.decimals()])
    const dec0 = Number(dec0Raw)
    const dec1 = Number(dec1Raw)

    const reserve0 = Number(ethers.formatUnits(reserves[0], dec0))
    const reserve1 = Number(ethers.formatUnits(reserves[1], dec1))

    const price = reserve1 > 0 ? reserve0 / reserve1 : 0
    return price
  } catch (error) {
    console.error("Error fetching pair price:", error)
    return 0
  }
}

export async function fetchPairInfo(pairAddress: string) {
  if (!pairAddress) return null

  // Enhanced query to get more detailed information
  const query = `{
    pair(id: "${pairAddress}") {
      id
      token0Price
      token1Price
      volumeUSD
      reserveUSD
      totalSupply
      reserve0
      reserve1
      token0 {
        id
        symbol
        decimals
        totalLiquidity
        derivedBNB
        derivedUSD
      }
      token1 {
        id
        symbol
        decimals
        totalLiquidity
        derivedBNB
        derivedUSD
      }
    }
    pairDayDatas(first: 1, orderBy: date, orderDirection: desc, where: { pairAddress: "${pairAddress}" }) {
      dailyVolumeUSD
      reserveUSD
    }
  }`

  try {
    const response = await fetch(PANCAKESWAP_SUBGRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    })

    const data = await response.json()
    console.log(data);
    

    // Add 24h volume from pairDayDatas if available
    if (data.data.pairDayDatas && data.data.pairDayDatas.length > 0) {
      data.data.pair.dailyVolumeUSD = data.data.pairDayDatas[0].dailyVolumeUSD
    }

    return data.data.pair
  } catch (error) {
    console.error("Error fetching pair info:", error)
    return null
  }
}

// Calculate 24h volume for a pair
export async function fetch24hVolume(pairAddress: string): Promise<number> {
  if (!pairAddress) return 0

  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60

  const query = `{
    swaps(first: 1000, where: { pair: "${pairAddress}", timestamp_gt: ${oneDayAgo} }) {
      amountUSD
    }
  }`

  try {
    const response = await fetch(PANCAKESWAP_SUBGRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    })

    const data = await response.json()

    if (!data.data || !data.data.swaps) return 0

    return data.data.swaps.reduce((acc: number, swap: any) => {
      return acc + Number(swap.amountUSD || 0)
    }, 0)
  } catch (error) {
    console.error("Error fetching 24h volume:", error)
    return 0
  }
}
