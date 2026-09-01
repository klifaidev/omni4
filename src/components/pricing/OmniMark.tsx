/**
 * Roteiro Visual, item 3.1 — logomark definitivo do OMNI4.
 *
 * "Ponte": 4 barras ascendentes referenciando o Bridge PVM (a análise mais
 * característica do produto — o que explica a variação de margem entre dois
 * períodos). Escolhida entre 9 propostas apresentadas ao usuário.
 *
 * Usa hsl(var(--primary)) → hsl(var(--accent)) como estopes do gradiente,
 * em vez de hex fixo, pra herdar automaticamente claro/escuro e o modo
 * Inovação (que reescreve esses mesmos tokens).
 */
import { useId } from "react";

export function OmniMark({ className }: { className?: string }) {
  const gradientId = `omni-mark-gradient-${useId()}`;
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="OMNI4"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--accent))" />
        </linearGradient>
      </defs>
      <rect x="8" y="40" width="9" height="16" rx="2" fill={`url(#${gradientId})`} opacity="0.55" />
      <rect x="21" y="30" width="9" height="26" rx="2" fill={`url(#${gradientId})`} opacity="0.75" />
      <rect x="34" y="18" width="9" height="38" rx="2" fill={`url(#${gradientId})`} opacity="0.9" />
      <rect x="47" y="8" width="9" height="48" rx="2" fill={`url(#${gradientId})`} />
    </svg>
  );
}
