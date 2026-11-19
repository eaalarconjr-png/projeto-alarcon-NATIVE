import type { ComponentType } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BellRing,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { getCurrentUser } from '@/services/auth'

type NavItem = {
  to: string
  label: string
  gestor: boolean
  icon: ComponentType<{ className?: string }>
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  atendimento: 'Atendimento',
  gestor_trafego: 'Gestor de tráfego',
}

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

/**
 * Layout com menu principal (correção do teste da fase 1: as telas existiam,
 * mas não havia navegação para alcançá-las). Login e formulário público ficam
 * fora deste menu, de propósito. A partir da fase 2, Convênios e Qualificação
 * ficam escondidos do gestor de tráfego (SPEC: ele não vê ficha clínica).
 *
 * Refresh visual (nov/2026): menu lateral em grupos, saudação e data no topo.
 * Mesmos itens, mesmas rotas e mesma regra de acesso por papel.
 */
export default function Layout() {
  const user = getCurrentUser()
  const role = user?.role
  const isGestor = role === 'gestor_trafego'

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Atendimento',
      items: [
        { to: '/conversas', label: 'Conversas', gestor: false, icon: MessageCircle },
        { to: '/whatsapp', label: 'WhatsApp', gestor: false, icon: MessagesSquare },
        { to: '/', label: 'Oportunidades', gestor: true, icon: Users },
        { to: '/contatos/novo', label: 'Novo contato', gestor: true, icon: UserPlus },
        { to: '/fila', label: 'Fila', gestor: false, icon: ListChecks },
        { to: '/agenda', label: 'Agenda', gestor: false, icon: CalendarDays },
        { to: '/alertas', label: 'Alertas', gestor: false, icon: BellRing },
      ],
    },
    {
      title: 'Gestão',
      items: [
        { to: '/painel', label: 'Painel', gestor: true, icon: LayoutDashboard },
        { to: '/midia', label: 'Mídia', gestor: true, icon: Megaphone },
        { to: '/convenios', label: 'Convênios', gestor: false, icon: ShieldCheck },
        { to: '/regras', label: 'Qualificação', gestor: false, icon: ClipboardList },
        { to: '/formularios', label: 'Formulários', gestor: true, icon: FileText },
        { to: '/configuracoes', label: 'Configuração', gestor: true, icon: Settings },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((item) => !isGestor || item.gestor) }))
    .filter((g) => g.items.length > 0)

  const allItems = groups.flatMap((g) => g.items)

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const firstName = user?.name?.split(/[\s@]/)[0]
  const displayName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : ''

  return (
    <div className="min-h-screen bg-background p-3 md:p-5">
      <div className="mx-auto flex max-w-[1560px] items-start gap-5">
        {/* Menu lateral (telas médias e grandes) */}
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-64 shrink-0 flex-col rounded-[2rem] bg-card p-4 shadow-card md:flex">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_18px_-8px_hsl(var(--primary)/0.7)]">
              <HeartPulse className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight">Alarcon</p>
              <p className="text-xs text-muted-foreground">Medical Center</p>
            </div>
          </div>

          <nav className="mt-6 flex-1 space-y-6 overflow-y-auto pr-1" aria-label="Menu principal">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-semibold transition-colors ${
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                              isActive
                                ? 'bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_hsl(var(--primary)/0.7)]'
                                : 'bg-muted text-muted-foreground group-hover:bg-card'
                            }`}
                          >
                            <item.icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {user && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-muted/70 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {initials(user.name)}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[user.role] ?? user.role}
                </p>
              </div>
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Cabeçalho: saudação e data */}
          <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                {greeting()}
                {displayName ? `, ${displayName}` : ''}
              </h2>
              <p className="text-sm text-muted-foreground first-letter:uppercase">
                {today} · Alarcon Medical Center
              </p>
            </div>
          </header>

          {/* Menu em telas pequenas: pílulas rolando na horizontal */}
          <nav
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden"
            aria-label="Menu principal"
          >
            {allItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-subtle ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'
                  }`
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <main className="app-main flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
