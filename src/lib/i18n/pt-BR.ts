// Dicionário PT-BR — única localidade hoje. Ver README em ./index.ts para a
// convenção de uso e o que já foi migrado.
//
// Estrutura: <domínio>.<área>.<sub-área>, espelhando a árvore de componentes
// de quem consome. Valor interpolado (ex.: "Opacidade 40%") vira função, não
// string — mantém tudo com o mesmo tipo de acesso (`strings.a.b.c` ou
// `strings.a.b.c(valor)`), sem precisar de um parser de placeholder.
export const ptBR = {
  slides: {
    editor: {
      inspectors: {
        shape: {
          sections: {
            shape: "Forma",
            fill: "Preenchimento",
            outline: "Contorno",
            line: "Linha",
            geometry: "Geometria",
            shadow: "Sombra",
          },
          noFill: "Sem fundo",
          color: "Cor",
          borderColor: "Cor da borda",
          opacityPct: (pct: number) => `Opacidade ${pct}%`,
          thickness: "Espessura",
          style: "Estilo",
          strokeStyle: {
            solid: "Sólido",
            dashed: "Tracejado",
            dotted: "Pontilhado",
          },
          direction: "Direção",
          arrowStart: "Ponta inicial",
          arrowEnd: "Ponta final",
          radius: "Raio",
          rotationDeg: "Rotação°",
          showShadow: "Mostrar sombra",
          blur: "Desfoque",
          axisX: "X",
          axisY: "Y",
        },
      },
    },
  },
} as const;
