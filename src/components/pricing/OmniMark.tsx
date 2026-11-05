/**
 * Marca do OMNI4: o símbolo (fita azul/roxa) e o nome em letras.
 *
 * O símbolo é uma imagem com as cores da marca. O nome é só o FORMATO das
 * letras (public/brand/omni4-wordmark.png), pintado com a cor do texto do
 * tema, para aparecer tanto no tema escuro quanto no claro.
 */
export function OmniMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/omni4-mark.png"
      alt="OMNI4"
      className={className}
      draggable={false}
    />
  );
}

export function OmniWordmark({ className }: { className?: string }) {
  const mask = 'url("/brand/omni4-wordmark.png") center / contain no-repeat';
  return (
    <span
      role="img"
      aria-label="OMNI4"
      className={`inline-block aspect-[806/162] bg-gradient-to-b from-foreground to-foreground/70 ${className ?? ""}`}
      style={{ WebkitMask: mask, mask }}
    />
  );
}
