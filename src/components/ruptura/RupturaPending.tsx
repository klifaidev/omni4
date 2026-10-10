import { Lock } from "lucide-react";
import { GlassCard } from "@/components/pricing/GlassCard";

const ITEMS: Array<{ title: string; needs: string; why: string }> = [
  {
    title: "Taxa de ruptura e cobertura de lojas",
    needs: "Respostas “Não” na base · universo de lojas elegíveis",
    why: "Sem os “Não”, só aparecem lojas com ruptura: não há denominador. Cobertura também exige saber quantas lojas deveriam ser pesquisadas.",
  },
  {
    title: "Causa provável (cadastro × histórico de venda)",
    needs: "De/Para Rede → clientes do KE30 e SKU → código de material",
    why: "A pesquisa não traz código de cliente nem de produto, e no KE30 o nome do cliente e do artigo vem truncado. Ligar pelo nome dá falsos pares — sem o De/Para, a causa seria um palpite.",
  },
  {
    title: "Receita e margem potencial",
    needs: "O De/Para acima + volume de referência por loja",
    why: "O KE30 é por cliente, não por PDV. A estimativa só é honesta onde o código de cliente corresponde à loja ou existe um denominador de lojas confiável.",
  },
  {
    title: "Matriz de priorização, simulador e ações recomendadas",
    needs: "Taxa de ruptura + margem potencial + causa provável",
    why: "Os quadrantes cruzam taxa e margem; o simulador aplica % sobre a margem potencial; as ações dependem da causa.",
  },
];

export function RupturaPending() {
  return (
    <GlassCard className="p-5">
      <header className="mb-3">
        <h2 className="text-sm font-medium">O que ainda não dá para calcular com segurança</h2>
        <p className="text-[11px] text-muted-foreground">Estes blocos entram quando os dados abaixo existirem — até lá, nada de valor estimado na tela.</p>
      </header>
      <ul className="grid gap-3 md:grid-cols-2">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3 rounded-xl border border-border/40 bg-secondary/20 p-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <div className="text-xs font-medium">{item.title}</div>
              <div className="text-[11px] text-warning">Requer: {item.needs}</div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{item.why}</p>
            </div>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
