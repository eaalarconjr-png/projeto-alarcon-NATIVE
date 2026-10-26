import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Oportunidades' },
  { to: '/contatos/novo', label: 'Novo contato' },
  { to: '/formularios', label: 'Formulários' },
  { to: '/configuracoes', label: 'Configuração' },
]

/**
 * Layout com menu principal (correção do teste da fase 1: as telas existiam,
 * mas não havia navegação para alcançá-las). Login e formulário público ficam
 * fora deste menu, de propósito.
 */
export default function Layout() {
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
