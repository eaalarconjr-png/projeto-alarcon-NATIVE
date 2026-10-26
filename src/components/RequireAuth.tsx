import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { getCurrentUser, isTrafficManager, type TeamUser } from '@/services/auth'

/**
 * Guarda de rota da equipe: só entra quem está autenticado.
 * A permissão real fica no servidor (regras das coleções); aqui o gestor de
 * tráfego é levado para a tela de acesso restrito, sem ver a ficha.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [user, setUser] = useState<TeamUser | null>(null)
  const location = useLocation()

  useEffect(() => {
    // authStore.isValid decodifica a expiração do token; o refresh revalida no servidor
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
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (isTrafficManager(user)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">Acesso restrito</h1>
        <p className="max-w-md text-muted-foreground">
          Este perfil acompanha indicadores gerais. As fichas de pacientes ficam visíveis apenas
          para a equipe de atendimento e administração.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
