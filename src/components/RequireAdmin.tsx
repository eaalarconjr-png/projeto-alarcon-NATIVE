import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { getCurrentUser, type TeamUser } from '@/services/auth'

/**
 * Guarda de rota do painel admin: exige sessão PocketBase com papel admin.
 * Sem sessão → /admin/login (rotas do painel admin redirecionam para login).
 */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [user, setUser] = useState<TeamUser | null>(null)
  const location = useLocation()

  useEffect(() => {
    const current = getCurrentUser()
    setUser(current)
    if (current) {
      pb.collection('users')
        .authRefresh()
        .then(() => setUser(getCurrentUser()))
        .catch(() => setUser(null))
        .finally(() => setChecked(true))
    } else {
      setChecked(true)
    }
  }, [])

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  if (user.role !== 'admin') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">Acesso restrito</h1>
        <p className="max-w-md text-muted-foreground">
          O painel admin é exclusivo do administrador.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
