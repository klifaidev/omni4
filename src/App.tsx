import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "./layouts/AppShell";
import Index from "./pages/Index.tsx";
import VisaoGeral from "./pages/VisaoGeral.tsx";
import BridgePvm from "./pages/BridgePvm.tsx";
import Preco from "./pages/Preco.tsx";
import Dre from "./pages/Dre.tsx";
import Canais from "./pages/Canais.tsx";
import Custos from "./pages/Custos.tsx";
import Budget from "./pages/Budget.tsx";
import Rolling from "./pages/Rolling.tsx";
import SlidesBeta from "./pages/SlidesBeta.tsx";
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
import Inteligencia from "./pages/Inteligencia.tsx";
import NotFound from "./pages/NotFound.tsx";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Index />} />
          <Route path="/visao-geral" element={<VisaoGeral />} />
          <Route path="/bridge-pvm" element={<BridgePvm />} />
          <Route path="/preco" element={<Preco />} />
          <Route path="/dre" element={<Dre />} />
          <Route path="/canais" element={<Canais />} />
          <Route path="/custos" element={<Custos />} />
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
          <Route path="/inteligencia" element={<Inteligencia />} />
          <Route path="/farol" element={<FarolCadastro />} />
          <Route path="/slides" element={<SlidesBeta />} />
          <Route path="/upload" element={<Upload />} />
        </Route>
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  </TooltipProvider>
);

export default App;
