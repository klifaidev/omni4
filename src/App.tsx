import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppPreloader } from "@/components/pricing/AppPreloader";
import AppShell from "./layouts/AppShell";
import { PAGES } from "./layouts/pageTable";
import NotFound from "./pages/NotFound.tsx";

// As páginas moram em layouts/pageTable e são desenhadas por layouts/KeptPages
// (ficam montadas para abrir na hora); as rotas aqui só dizem quais caminhos
// existem. NotFound fica eager: é a rota catch-all "*", que vive fora do
// <AppShell /> e por isso fora dos Suspense das páginas.

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <AppPreloader>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            {PAGES.map((page) => (
              <Route key={page.path} path={page.path} element={null} />
            ))}
            <Route path="/slides" element={null} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </AppPreloader>
  </TooltipProvider>
);

export default App;
