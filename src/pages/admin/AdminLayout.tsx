import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Database, LogOut, Plug, RefreshCw, ShieldCheck, Trash2, UserPlus, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut, getCurrentUser } from '@/services/auth'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  atendimento: 'Atendimento',
  gestor_trafego: 'Gestor de tráfego',
}

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: Database, end: true },
  { to: '/admin/mcp', label: 'MCP', icon: Plug },
]

/** Layout próprio do painel admin (independente do menu da equipe). */
export default function AdminLayout() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const u = getCurrentUser()
    setUser(u ? { name: u.name, role: u.role } : null)
  }, [])

  const handleLogout = () => {
    signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-muted/30 p-3 md:p-5">
      <div className="mx-auto flex max-w-[1400px] items-start gap-5">
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-60 shrink-0 flex-col rounded-2xl border bg-card p-4 md:flex">
          <div className="flex items-center gap-2 px-1 py-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight">Admin</p>
              <p className="text-xs text-muted-foreground">Alarcon Medical</p>
            </div>
          </div>

          <nav className="mt-6 flex-1 space-y-1" aria-label="Menu admin">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {user && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {initials(user.name)}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[user.role] ?? user.role}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                aria-label="Sair"
                title="Sair"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          {/* topo mobile com navegação e sair */}
          <div className="mb-4 flex items-center gap-2 md:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'
                  }`
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
            <Button variant="outline" size="sm" onClick={handleLogout} className="ml-auto">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sair
            </Button>
          </div>

          <main className="min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
