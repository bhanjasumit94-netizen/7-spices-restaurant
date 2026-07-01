// Money formatting helpers

export function inr(n: number) {
  return `₹${n.toFixed(2)}`;
}

export function shortNum(n: number) {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}
