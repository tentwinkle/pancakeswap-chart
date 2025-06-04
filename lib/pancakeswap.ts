import { ethers } from "ethers"

// PancakeSwap V2 Factory and common addresses
export const PANCAKESWAP_V2_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"
export const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
export const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"

// The Graph endpoint for PancakeSwap
export const PANCAKESWAP_SUBGRAPH_URL = "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange"

// BNB Chain RPC
export const BNB_RPC_URL = "https://bsc-dataseed1.binance.org/"

export const provider = new ethers.JsonRpcProvider(BNB_RPC_URL)

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

export async function fetchHistoricalCandles(pairAddress: string, interval: string, limit = 100) {
  // This would typically fetch from The Graph or another data source
  // For demo purposes, we'll generate sample data
  const now = Date.now()
  const intervalMs = getIntervalMs(interval)

  const candles = []
  let basePrice = 100 + Math.random() * 900 // Random base price

  for (let i = limit; i >= 0; i--) {
    const time = Math.floor((now - i * intervalMs) / 1000)
    const open = basePrice
    const volatility = 0.02 // 2% volatility
    const change = (Math.random() - 0.5) * volatility * basePrice
    const close = open + change
    const high = Math.max(open, close) + Math.random() * volatility * basePrice * 0.5
    const low = Math.min(open, close) - Math.random() * volatility * basePrice * 0.5

    candles.push({
      time,
      open,
      high,
      low,
      close,
    })

    basePrice = close
  }

  return candles
}

export function getIntervalMs(interval: string): number {
  const intervals: Record<string, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
  }

  return intervals[interval] || intervals["1h"]
}

export function createPairContract(pairAddress: string) {
  return new ethers.Contract(pairAddress, PAIR_ABI, provider)
}
