import { lazy, Suspense } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppPreloader } from "@/components/pricing/AppPreloader";
import AppShell from "./layouts/AppShell";
import Index from "./pages/Index.tsx";
import VisaoGeral from "./pages/VisaoGeral.tsx";
import BridgePvm from "./pages/BridgePvm.tsx";
import Mix from "./pages/Mix.tsx";
import Preco from "./pages/Preco.tsx";
import Dre from "./pages/Dre.tsx";
import Canais from "./pages/Canais.tsx";
import Custos from "./pages/Custos.tsx";
import Inovacao from "./pages/Inovacao.tsx";
import MargemTarget from "./pages/MargemTarget.tsx";
import Budget from "./pages/Budget.tsx";
import Rolling from "./pages/Rolling.tsx";
import Abc from "./pages/Abc.tsx";
import Detalhe from "./pages/Detalhe.tsx";
import Upload from "./pages/Upload.tsx";
import Atividades from "./pages/Atividades.tsx";
import Alertas from "./pages/Alertas.tsx";
import Filtros from "./pages/Filtros.tsx";
import Demanda from "./pages/Demanda.tsx";
import Estoque from "./pages/Estoque.tsx";
import Positivacao from "./pages/Positivacao.tsx";
import FarolCadastro from "./pages/FarolCadastro.tsx";
import NotFound from "./pages/NotFound.tsx";
import { preloadSlidesRoute } from "@/lib/preloadSlidesRoute";

const SlidesBeta = lazy(() => preloadSlidesRoute());

function SlidesRouteFallback() {
  return (
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-lg border border-border/70 bg-card/90 p-5 text-center shadow-sm">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <p className="text-sm font-medium text-foreground">Carregando Slides</p>
        <p className="mt-1 text-xs text-muted-foreground">Preparando o editor e os recursos de exportacao.</p>
      </div>
    </div>
  );
}

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <AppPreloader>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Index />} />
            <Route path="/visao-geral" element={<VisaoGeral />} />
            <Route path="/bridge-pvm" element={<BridgePvm />} />
            <Route path="/mix" element={<Mix />} />
            <Route path="/preco" element={<Preco />} />
            <Route path="/dre" element={<Dre />} />
            <Route path="/canais" element={<Canais />} />
            <Route path="/custos" element={<Custos />} />
            <Route path="/inovacao" element={<Inovacao />} />
            <Route path="/margem-target" element={<MargemTarget />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/rolling" element={<Rolling />} />
            <Route path="/abc" element={<Abc />} />
            <Route path="/detalhe" element={<Detalhe />} />
            <Route path="/atividades" element={<Atividades />} />
            <Route path="/alertas" element={<Alertas />} />
            <Route path="/filtros" element={<Filtros />} />
            <Route path="/demanda" element={<Demanda />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/positivacao" element={<Positivacao />} />
            <Route path="/farol" element={<FarolCadastro />} />
            <Route
              path="/slides"
              element={(
                <Suspense fallback={<SlidesRouteFallback />}>
                  <SlidesBeta />
                </Suspense>
              )}
            />
            <Route path="/upload" element={<Upload />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </AppPreloader>
  </TooltipProvider>
);

export default App;
