export type RandomSource = () => number;

export function createSeededRandom(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(seed: number | undefined): number {
  return Number.isSafeInteger(seed) ? (seed as number) >>> 0 : 0x3c6ef372;
}
