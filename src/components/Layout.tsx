import { NavLink, Outlet } from 'react-router-dom'
import { getCurrentUser } from '@/services/auth'

/**
 * Layout com menu principal (correção do teste da fase 1: as telas existiam,
 * mas não havia navegação para alcançá-las). Login e formulário público ficam
 * fora deste menu, de propósito. A partir da fase 2, Convênios e Qualificação
 * ficam escondidos do gestor de tráfego (SPEC: ele não vê ficha clínica).
 */
export default function Layout() {
  const role = getCurrentUser()?.role
  const isGestor = role === 'gestor_trafego'
  const navItems = [
    { to: '/painel', label: 'Painel', gestor: true },
    { to: '/midia', label: 'Mídia', gestor: true },
    { to: '/', label: 'Oportunidades', gestor: true },
    { to: '/contatos/novo', label: 'Novo contato', gestor: true },
    { to: '/convenios', label: 'Convênios', gestor: false },
    { to: '/regras', label: 'Qualificação', gestor: false },
    { to: '/fila', label: 'Fila', gestor: false },
    { to: '/agenda', label: 'Agenda', gestor: false },
    { to: '/alertas', label: 'Alertas', gestor: false },
    { to: '/formularios', label: 'Formulários', gestor: true },
    { to: '/configuracoes', label: 'Configuração', gestor: true },
  ].filter((item) => !isGestor || item.gestor)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-background">
        <nav
          className="mx-auto flex max-w-4xl flex-wrap items-center gap-1 p-2"
          aria-label="Menu principal"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
