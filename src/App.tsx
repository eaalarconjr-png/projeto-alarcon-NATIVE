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
          {/* ADD ALL CUSTOM ROUTES MUST BE ADDED HERE */}
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
