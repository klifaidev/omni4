import { lazy } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppPreloader } from "@/components/pricing/AppPreloader";
import AppShell from "./layouts/AppShell";
import NotFound from "./pages/NotFound.tsx";

// Code-split por rota: cada página vira um chunk separado, baixado só quando
// visitada. Antes disso, todas essas 22 páginas eram importadas de forma
// eager e caíam no bundle principal (3.17MB / 863KB gzip antes desta
// mudança) — em máquina/rede lenta isso significava baixar e parsear o
// código de páginas que o usuário talvez nunca abra só pra ver a Home.
// Suspense fica em AppShell.tsx, ao redor do <Outlet />.
const Index = lazy(() => import("./pages/Index.tsx"));
const VisaoGeral = lazy(() => import("./pages/VisaoGeral.tsx"));
const BridgePvm = lazy(() => import("./pages/BridgePvm.tsx"));
const Mix = lazy(() => import("./pages/Mix.tsx"));
const Preco = lazy(() => import("./pages/Preco.tsx"));
const Dre = lazy(() => import("./pages/Dre.tsx"));
const Canais = lazy(() => import("./pages/Canais.tsx"));
const Custos = lazy(() => import("./pages/Custos.tsx"));
const Inovacao = lazy(() => import("./pages/Inovacao.tsx"));
const MargemTarget = lazy(() => import("./pages/MargemTarget.tsx"));
const Budget = lazy(() => import("./pages/Budget.tsx"));
const Abc = lazy(() => import("./pages/Abc.tsx"));
const Detalhe = lazy(() => import("./pages/Detalhe.tsx"));
const Upload = lazy(() => import("./pages/Upload.tsx"));
const Atividades = lazy(() => import("./pages/Atividades.tsx"));
const Alertas = lazy(() => import("./pages/Alertas.tsx"));
const Filtros = lazy(() => import("./pages/Filtros.tsx"));
const Positivacao = lazy(() => import("./pages/Positivacao.tsx"));
const FarolCadastro = lazy(() => import("./pages/FarolCadastro.tsx"));
// NotFound fica eager (import normal, acima): é a rota catch-all "*", que
// vive fora do <Route element={<AppShell />}> e por isso fora do Suspense
// que envolve o <Outlet /> em AppShell.tsx — lazy aqui suspenderia sem
// nenhum boundary acima e derrubaria a tela de erro do app.

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
            <Route path="/abc" element={<Abc />} />
            <Route path="/detalhe" element={<Detalhe />} />
            <Route path="/atividades" element={<Atividades />} />
            <Route path="/alertas" element={<Alertas />} />
            <Route path="/filtros" element={<Filtros />} />
            <Route path="/positivacao" element={<Positivacao />} />
            <Route path="/farol" element={<FarolCadastro />} />
            <Route path="/slides" element={null} />
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
