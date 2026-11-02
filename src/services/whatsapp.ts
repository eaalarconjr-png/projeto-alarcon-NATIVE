// AL-F4-01: serviço da tela WhatsApp. Só o serviço fala com o SDK/rotas.
// Regras: a chave da D-API nunca chega ao navegador (o servidor devolve só a PRESENÇA);
// o sessionId vem mascarado; nada aqui conecta o número real.
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { getCurrentUser } from '@/services/auth'

export type ConnectionStatus = 'desconectado' | 'demonstracao' | 'conectado' | 'erro'
export type GreetingMode = 'desligado' | 'somente_teste' | 'ligado'

export interface ChannelConnection {
  id: string
  label: string
  phone_number: string
  session_id_masked: string
  mode: string
  status: ConnectionStatus
  status_reason: string
  last_event_at: string
  token_rotated_at: string
  active: boolean
  is_fixture: boolean
  other_bot_active: boolean
  greeting_mode: GreetingMode
  greeting_text_open: string
  greeting_text_closed: string
  greeting_approved_at: string
  greeting_test_phones: string
}

export interface ConnectionState {
  connections: ChannelConnection[]
  secrets: {
    DAPI_API_KEY: boolean
    DAPI_WEBHOOK_TOKEN: boolean
    DAPI_WEBHOOK_TOKEN_ANTERIOR: boolean
  }
  rules: { greeting_live_requires: string; read_only: string; coexistence: string }
}

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  desconectado: 'Desconectado',
  demonstracao: 'Demonstração (sem número real)',
  conectado: 'Conectado',
  erro: 'Erro na conexão',
}

export const GREETING_LABEL: Record<GreetingMode, string> = {
  desligado: 'Desligado',
  somente_teste: 'Somente para números de teste',
  ligado: 'Ligado para todos',
}

const requireAdmin = () => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') throw new Error('Apenas o administrador acessa a conexão do WhatsApp.')
  return user
}

export const getConnectionState = async (): Promise<ConnectionState> => {
  requireAdmin()
  try {
    const res = await pb.send('/backend/v1/whatsapp/conexao', { method: 'GET' })
    return res as unknown as ConnectionState
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface ConnectionInput {
  id?: string
  label?: string
  phone_number?: string
  other_bot_active?: boolean
  active?: boolean
  default_owner?: string
  greeting_mode?: GreetingMode
  greeting_text_open?: string
  greeting_text_closed?: string
  greeting_test_phones?: string
}

export const saveConnection = async (data: ConnectionInput): Promise<void> => {
  requireAdmin()
  try {
    await pb.send('/backend/v1/whatsapp/conexao', { method: 'POST', body: data })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/** Só dígitos, com 55 — formato que a D-API espera no envio. */
export const normalizePhone = (raw: string): string => {
  let digits = String(raw || '').replace(/\D/g, '')
  if (digits.length >= 10 && !digits.startsWith('55')) digits = '55' + digits
  return digits
}

export const formatPhone = (digits: string): string => {
  const d = String(digits || '')
  if (d.length === 13 && d.startsWith('55')) {
    // +55 11 99326-8552
    return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`
  }
  return d
}
