// task AL-F1-01: acesso à sessão — só o serviço fala com o SDK (padrão do template)
import pb from '@/lib/pocketbase/client'

export type Role = 'admin' | 'atendimento' | 'gestor_trafego'

export interface TeamUser {
  id: string
  email: string
  name: string
  role: Role
}

export const signIn = async (
  email: string,
  password: string,
): Promise<{ error: string | null }> => {
  try {
    await pb.collection('users').authWithPassword(email, password)
    return { error: null }
  } catch {
    return { error: 'E-mail ou senha incorretos. Confira os dados e tente novamente.' }
  }
}

export const signOut = () => pb.authStore.clear()

export const getCurrentUser = (): TeamUser | null => {
  if (!pb.authStore.isValid) return null
  const r = pb.authStore.record
  return {
    id: r.id,
    email: r.email,
    name: (r.name as string) || r.email,
    role: (r.role as Role) || 'atendimento',
  }
}

export const isTrafficManager = (user: TeamUser | null): boolean => user?.role === 'gestor_trafego'
