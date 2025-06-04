import TradingChart from "@/components/trading-chart"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">PancakeSwap Trading Charts</h1>
          <p className="text-muted-foreground">Real-time candlestick charts for top BNB Chain trading pairs</p>
        </div>
        <TradingChart />
      </div>
    </div>
  )
}
