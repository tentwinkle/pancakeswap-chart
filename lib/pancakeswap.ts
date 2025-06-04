import { ethers } from "ethers"

// PancakeSwap V2 Factory and common addresses
export const PANCAKESWAP_V2_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"
export const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
export const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"

// The Graph endpoint for PancakeSwap
export const PANCAKESWAP_SUBGRAPH_URL = "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange"

// BNB Chain RPC
export const BNB_RPC_URL = "https://bsc-dataseed1.binance.org/"
export const BNB_WS_URL = "wss://bsc-ws-node.nariox.org:443"

export const provider = new ethers.JsonRpcProvider(BNB_RPC_URL)

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
]

export async function fetchTopPairs(): Promise<any[]> {
  const query = `
    {
      pairs(first: 20, orderBy: volumeUSD, orderDirection: desc, where: {volumeUSD_gt: "1000"}) {
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
) {
  const intervalMs = getIntervalMs(interval)
  const endTime = Math.floor(Date.now() / 1000)
  const startTime = endTime - Math.floor((intervalMs * limit) / 1000)

  const query = `{
    swaps(first: 1000, orderBy: timestamp, orderDirection: asc, where: { pair: \"${pairAddress}\", timestamp_gt: ${startTime} }) {
      amount0In
      amount1In
      amount0Out
      amount1Out
      timestamp
    }
  }`

  try {
    const res = await fetch(PANCAKESWAP_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
    const json = await res.json()
    const swaps = json.data.swaps as Array<any>

    const candles: any[] = []
    const grouped: Record<number, any[]> = {}

    for (const swap of swaps) {
      const price = swap.amount1In > 0
        ? Number(swap.amount0In) / Number(swap.amount1In)
        : Number(swap.amount1Out) > 0
          ? Number(swap.amount0Out) / Number(swap.amount1Out)
          : 0
      const volume = Math.abs(Number(swap.amount0In) - Number(swap.amount0Out))
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
      candles.push({
        time: Math.floor(Number(key) / 1000),
        open,
        high,
        low,
        close,
      })
    }

    return candles.slice(-limit)
  } catch (err) {
    console.error("Error fetching historical candles", err)
    return []
  }
}

export function getIntervalMs(interval: string): number {
  const intervals: Record<string, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "5h": 5 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7D": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
    "1Y": 365 * 24 * 60 * 60 * 1000,
    All: 30 * 24 * 60 * 60 * 1000,
  }

  return intervals[interval] || intervals["1h"]
}

export function createPairContract(pairAddress: string, prov: ethers.Provider = provider) {
  return new ethers.Contract(pairAddress, PAIR_ABI, prov)
}
