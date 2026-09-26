// Textos de exemplo que o editor insere nos blocos ("Título do slide",
// "Clique para editar este texto.", textos dos layouts rápidos e cards de
// storytelling). Servem de marcador: ao editar, entram selecionados (a
// primeira tecla substitui, como o marcador do PowerPoint), e o pré-voo avisa
// se algum ainda está no slide antes de exportar.
import { strings } from "@/lib/i18n";

const BASE_SAMPLES = [
  "Título do slide",
  "Novo título",
  "Novo slide",
  "Clique para editar este texto.",
];

let samples: Set<string> | null = null;

function collectStrings(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    out.add(value.trim());
    return;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) collectStrings(child, out);
  }
}

function sampleSet(): Set<string> {
  if (samples) return samples;
  const set = new Set(BASE_SAMPLES);
  const editor = strings.slides.editor.customSlideEditor;
  const { buttons: _buttons, ...quickLayoutTexts } = editor.quickLayouts;
  collectStrings(quickLayoutTexts, set);
  collectStrings(editor.textStyles, set);
  collectStrings(editor.storyCards, set);
  samples = set;
  return set;
}

export function isSampleText(text: string | null | undefined): boolean {
  const trimmed = text?.trim();
  return !!trimmed && sampleSet().has(trimmed);
}
