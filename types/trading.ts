export interface TradingPair {
  address: string
  token0: string
  token1: string
  token0Symbol: string
  token1Symbol: string
  volumeUSD: string
  reserveUSD: string
}

export interface CandleData {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export interface VolumeData {
  time: number
  value: number
  color?: string
}

export interface PairStats {
  lastPrice: number
  change24h: number
  volume24h: number
  marketCap: number
}

export interface SwapEvent {
  timestamp: number
  price: number
  volume: number
  pair: string
}
