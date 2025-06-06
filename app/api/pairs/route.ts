import { NextResponse } from "next/server";
import { fetchTopPairs } from "@/lib/pancakeswap";
import type { TradingPair } from "@/types/trading";

export async function GET() {
  try {
    const pairs = await fetchTopPairs();

    const formattedPairs: TradingPair[] = pairs.map((pair) => ({
      address: pair.id,
      token0: pair.token0.id,
      token1: pair.token1.id,
      token0Symbol: pair.token0.symbol,
      token1Symbol: pair.token1.symbol,
      volumeUSD: pair.volumeUSD,
      reserveUSD: pair.reserveUSD,
    }));

    return NextResponse.json({ pairs: formattedPairs });
  } catch (error) {
    console.error("Error fetching pairs:", error);
    return NextResponse.json(
      { error: "Failed to fetch pairs" },
      { status: 500 }
    );
  }
}
