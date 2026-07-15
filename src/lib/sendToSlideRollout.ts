const SEND_TO_SLIDE_ROLLOUT_PAGES = new Set([
  "Visão Geral",
  "Positivação",
  "Análise de Preço",
  "Inovação",
]);

export function isSendToSlideEnabledForPage(page: string): boolean {
  return SEND_TO_SLIDE_ROLLOUT_PAGES.has(page);
}
