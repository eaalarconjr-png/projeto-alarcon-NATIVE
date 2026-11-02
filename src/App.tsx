/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import LoginPage from './pages/Login'
import HomePage from './pages/Home'
import OportunidadesPage from './pages/Oportunidades'
import NovoContatoPage from './pages/NovoContato'
import FichaPage from './pages/Ficha'
import ConfiguracoesPage from './pages/Configuracoes'
import FormulariosPage from './pages/Formularios'
import FormEditorPage from './pages/FormEditor'
import FormularioPublicoPage from './pages/FormularioPublico'
import ConveniosPage from './pages/Convenios'
import RegrasQualificacaoPage from './pages/RegrasQualificacao'
import FilaPage from './pages/Fila'
import AgendaPage from './pages/Agenda'
import AlertasPage from './pages/Alertas'
import PainelPage from './pages/Painel'
import MidiaPage from './pages/Midia'
import RequireAuth from './components/RequireAuth'

// ONLY IMPORT AND RENDER WORKING PAGES, NEVER ADD PLACEHOLDER COMPONENTS OR PAGES IN THIS FILE
// AVOID REMOVING ANY CONTEXT PROVIDERS FROM THIS FILE (e.g. TooltipProvider, Toaster, Sonner)

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/f/:versionId" element={<FormularioPublicoPage />} />{' '}
        <Route element={<Layout />}>
          <Route
            path="/"
            element={
              <RequireAuth>
                <OportunidadesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/contatos/novo"
            element={
              <RequireAuth>
                <NovoContatoPage />
              </RequireAuth>
            }
          />
          <Route
            path="/oportunidades/:id"
            element={
              <RequireAuth>
                <FichaPage />
              </RequireAuth>
            }
          />
          <Route
            path="/convenios"
            element={
              <RequireAuth>
                <ConveniosPage />
              </RequireAuth>
            }
          />
          <Route
            path="/regras"
            element={
              <RequireAuth>
                <RegrasQualificacaoPage />
              </RequireAuth>
            }
          />
          <Route
            path="/fila"
            element={
              <RequireAuth>
                <FilaPage />
              </RequireAuth>
            }
          />
          <Route
            path="/agenda"
            element={
              <RequireAuth>
                <AgendaPage />
              </RequireAuth>
            }
          />
          <Route
            path="/painel"
            element={
              <RequireAuth>
                <PainelPage />
              </RequireAuth>
            }
          />
          <Route
            path="/midia"
            element={
              <RequireAuth>
                <MidiaPage />
              </RequireAuth>
            }
          />
          <Route
            path="/alertas"
            element={
              <RequireAuth>
                <AlertasPage />
              </RequireAuth>
            }
          />
          <Route
            path="/configuracoes"
            element={
              <RequireAuth>
                <ConfiguracoesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/formularios"
            element={
              <RequireAuth>
                <FormulariosPage />
              </RequireAuth>
            }
          />
          <Route
            path="/formularios/:id"
            element={
              <RequireAuth>
                <FormEditorPage />
              </RequireAuth>
            }
          />
          {/* ADD ALL CUSTOM ROUTES MUST BE ADDED HERE */}
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
