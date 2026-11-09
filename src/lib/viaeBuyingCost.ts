// The tiered buying-cost allowance applies only to RMB supplier prices.
// SGD prices receive the mandatory tax (and any selected shipping) only.
export function viaeBuyingCostSgd(source: number, currency: string, tax = 3, shipping = 0) {
  const base = source * (currency === "RMB" ? 0.18 : 1);
  const allowance = currency !== "RMB" || base <= 0 ? 0
    : base > 20 ? 4 : base > 10 ? 3 : base > 5 ? 2 : base < 3 ? 2.5 : 1.5;
  return base * (1 + tax / 100) + shipping * (currency === "RMB" ? 0.18 : 1) + allowance;
}

export function viaeSuggestedSellingPhp(costSgd: number) {
  if (!Number.isFinite(costSgd) || costSgd <= 0) return 0;
  const sellingSgd = costSgd <= 10 ? costSgd * 3
    : costSgd <= 15 ? costSgd * 2.5
    : costSgd <= 20 ? costSgd * 2
    : costSgd * 1.5;
  // Keep the existing suggestion, but ensure a 50% deposit covers buying cost.
  return Math.round(Math.max(sellingSgd, costSgd * 2) * 49 / 10) * 10;
}
