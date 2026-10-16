// Em que unidade a base traz o volume? Os exports do SAP (KE30) costumam vir em
// "1.000 KG" — toneladas —, mas o app lê a coluna como quilos. Um volume por
// linha (cliente × SKU × mês) em quilos é, quase sempre, de dezenas de kg para
// cima (uma caixa tem ~10 kg); em toneladas fica abaixo de 1. Essa separação é
// nítida nas bases reais (≈96% das linhas abaixo de 1 em toneladas), então dá
// pra SUGERIR a unidade — nunca aplicar sozinho.

export type VolumeUnitGuess = "kg" | "ton" | "unknown";

export interface VolumeUnitDetection {
  guess: VolumeUnitGuess;
  /** Fração das linhas com volume positivo abaixo de 1 (0–1). */
  shareBelowOne: number;
  /** Linhas positivas analisadas. */
  sampled: number;
}

const MIN_SAMPLE = 50;
const MAX_SAMPLE = 20_000;
const TON_THRESHOLD = 0.6;
const KG_THRESHOLD = 0.15;

export function detectVolumeUnit(rows: ReadonlyArray<{ volumeKg?: number }>): VolumeUnitDetection {
  // Amostra espaçada: 20 mil linhas bastam e a base pode ter milhões.
  const step = Math.max(1, Math.floor(rows.length / MAX_SAMPLE));
  let sampled = 0;
  let below = 0;
  for (let i = 0; i < rows.length; i += step) {
    const v = rows[i].volumeKg;
    if (typeof v !== "number" || !(v > 0)) continue;
    sampled++;
    if (v < 1) below++;
  }
  const share = sampled > 0 ? below / sampled : 0;
  if (sampled < MIN_SAMPLE) return { guess: "unknown", shareBelowOne: share, sampled };
  const guess: VolumeUnitGuess = share >= TON_THRESHOLD ? "ton" : share <= KG_THRESHOLD ? "kg" : "unknown";
  return { guess, shareBelowOne: share, sampled };
}
