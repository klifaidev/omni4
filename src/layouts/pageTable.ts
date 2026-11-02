import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export interface PageEntry {
  path: string;
  label: string;
  load: () => Promise<{ default: ComponentType }>;
  Component: LazyExoticComponent<ComponentType>;
  /** Preenchido por `preparePage`: permite montar sem passar pelo Suspense. */
  loaded: ComponentType | null;
  /** Fica montada depois de aberta, e abre na hora nas próximas vezes. */
  keep: boolean;
  /** Já é montada na abertura do app (na ordem desta tabela). */
  warm: boolean;
}

function page(path: string, label: string, load: PageEntry["load"], options?: { keep?: boolean; warm?: boolean }): PageEntry {
  const keep = options?.keep ?? true;
  return { path, label, load, Component: lazy(load), loaded: null, keep, warm: options?.warm ?? keep };
}

/**
 * Carrega o código da aba. Com `lazy`, mesmo já carregada ela suspenderia e só
 * montaria mais tarde, em baixa prioridade — na entrada, depois de a tela de
 * carregamento já ter dito que estava tudo pronto.
 */
export async function preparePage(entry: PageEntry): Promise<void> {
  entry.loaded = (await entry.load()).default;
}

// Code-split por rota: cada página é um chunk separado. A abertura do app
// carrega e monta as marcadas com `warm`; o resto carrega ao abrir.
export const PAGES: PageEntry[] = [
  page("/", "Início", () => import("@/pages/Index.tsx")),
  page("/visao-geral", "Visão Geral", () => import("@/pages/VisaoGeral.tsx")),
  page("/bridge-pvm", "Bridge PVM", () => import("@/pages/BridgePvm.tsx")),
  page("/dre", "DRE", () => import("@/pages/Dre.tsx")),
  page("/mix", "Mix", () => import("@/pages/Mix.tsx")),
  page("/preco", "Preço", () => import("@/pages/Preco.tsx")),
  page("/canais", "Canais", () => import("@/pages/Canais.tsx")),
  page("/custos", "Custos", () => import("@/pages/Custos.tsx")),
  page("/abc", "Portfólio de SKUs", () => import("@/pages/Abc.tsx")),
  page("/budget", "Budget", () => import("@/pages/Budget.tsx")),
  page("/inovacao", "Inovação", () => import("@/pages/Inovacao.tsx")),
  page("/margem-target", "Margem Target", () => import("@/pages/MargemTarget.tsx")),
  page("/filtros", "Filtros", () => import("@/pages/Filtros.tsx")),
  page("/positivacao", "Positivação", () => import("@/pages/Positivacao.tsx")),
  page("/farol", "Farol de Cadastro", () => import("@/pages/FarolCadastro.tsx")),
  page("/ruptura", "Ruptura", () => import("@/pages/Ruptura.tsx")),
  page("/alertas", "Alertas", () => import("@/pages/Alertas.tsx")),
  page("/atividades", "Atividades", () => import("@/pages/Atividades.tsx")),
  // Tabela Dinâmica: guardada oculta, seguraria uma cópia de cada linha da base
  // (cerca de 1 GB medido com 1,4 milhão de linhas). Continua montando ao abrir.
  page("/detalhe", "Tabela Dinâmica", () => import("@/pages/Detalhe.tsx"), { keep: false }),
  // Upload relê do disco o que está salvo e recarrega bases ao montar: precisa
  // continuar sendo montado a cada visita, e nunca na abertura do app.
  page("/upload", "Bases", () => import("@/pages/Upload.tsx"), { keep: false }),
];

export const PAGE_BY_PATH = new Map(PAGES.map((entry) => [entry.path, entry]));
