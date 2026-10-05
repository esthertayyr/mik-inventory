// VIAE's RMB buying-cost allowance is not a customer selling-price markup.
export function viaeBuyingCostSgd(source: number, currency: string, tax = 3, shipping = 0) {
  const base = source * (currency === "RMB" ? 0.18 : 1);
  const allowance = currency !== "RMB" || source <= 0 ? 0
    : base > 20 ? 4 : base > 10 ? 3 : base > 5 ? 2 : base < 3 ? 2.5 : 1.5;
  return base * (1 + tax / 100) + shipping * (currency === "RMB" ? 0.18 : 1) + allowance;
}
