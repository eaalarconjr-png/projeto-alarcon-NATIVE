// AL-F4-03: serviço da caixa de atendimento (Conversas).
// Regras: a lista e o histórico só para admin/atendimento (o gestor de tráfego não vê conversa);
// o `media_url` nunca chega ao navegador — o anexo abre pela rota autenticada do servidor.
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { getCurrentUser } from '@/services/auth'

export type LinkState =
  | 'vinculada'
  | 'revisar'
  | 'sem_telefone'
  | 'historico_sem_contato'
  | 'nao_paciente'

export interface Conversation {
  id: string
  connection: string
  contact: string
  opportunity: string
  contact_phone: string
  contact_lid: string
  contact_name_wa: string
  link_state: LinkState
  assignee: string
  service_item: string
  last_inbound_at: string
  last_outbound_at: string
  window_expires_at: string
  is_fixture: boolean
  created: string
  expand?: {
    contact?: { name: string; phone: string }
    opportunity?: { interest: string; stage: string; status: string }
    assignee?: { name: string }
  }
}

export interface Message {
  id: string
  direction: 'entrada' | 'saida'
  author_kind: string
  author_user: string
  author_declared: boolean
  type: string
  text: string
  media_meta: string
  origin_ts: string
  status: string
  deleted: boolean
  from_history: boolean
}

export const LINK_STATE_LABEL: Record<LinkState, string> = {
  vinculada: 'Vinculada à ficha',
  revisar: 'Revisar vínculo',
  sem_telefone: 'Sem telefone',
  historico_sem_contato: 'Histórico sem contato',
  nao_paciente: 'Não é paciente',
}

export const AUTHOR_LABEL: Record<string, string> = {
  paciente: 'Paciente',
  equipe_celular: 'Equipe (celular)',
  celular_ou_robo: 'Celular ou Clara',
  equipe_crm: 'Equipe (CRM)',
  automatico: 'Acolhimento',
}

export type ConversationFilter =
  | 'todas'
  | 'minhas'
  | 'sem_responsavel'
  | 'revisar'
  | 'nao_pacientes'

const requireInbox = () => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin' && user.role !== 'atendimento') {
    throw new Error('A caixa de conversas é do atendimento.')
  }
  return user
}

export const listConversations = async (
  filter: ConversationFilter = 'todas',
): Promise<Conversation[]> => {
  const user = requireInbox()
  try {
    const conditions: string[] = []
    if (filter === 'minhas') conditions.push(`assignee = "${user.id}"`)
    if (filter === 'sem_responsavel') conditions.push('assignee = ""')
    if (filter === 'revisar') conditions.push('link_state = "revisar"')
    if (filter === 'nao_pacientes') conditions.push('link_state = "nao_paciente"')
    // "todas" esconde "não é paciente" (eles têm filtro próprio)
    if (filter === 'todas') conditions.push('link_state != "nao_paciente"')

    const list = await pb.collection('conversations').getList(1, 100, {
      filter: conditions.length ? pb.filter(conditions.join(' && ')) : undefined,
      sort: '-last_inbound_at,-updated',
      expand: 'contact,opportunity,assignee',
    })
    return list.items as unknown as Conversation[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const listMessages = async (conversationId: string): Promise<Message[]> => {
  requireInbox()
  try {
    // media_url NÃO é pedido: o campo é oculto, e o anexo abre pela rota do servidor
    const list = await pb.collection('messages').getList(1, 200, {
      filter: pb.filter('conversation = {:c}', { c: conversationId }),
      sort: 'origin_ts',
    })
    return list.items as unknown as Message[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const takeConversation = async (id: string): Promise<void> => {
  requireInbox()
  try {
    await pb.send(`/backend/v1/whatsapp/conversa/${id}/assumir`, { method: 'POST', body: {} })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const transferConversation = async (id: string, userId: string): Promise<void> => {
  requireInbox()
  try {
    await pb.send(`/backend/v1/whatsapp/conversa/${id}/assumir`, {
      method: 'POST',
      body: { user_id: userId },
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const markAsMine = async (messageId: string): Promise<void> => {
  requireInbox()
  try {
    await pb.send(`/backend/v1/whatsapp/mensagem/${messageId}/fui-eu`, { method: 'POST', body: {} })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const setNotPatient = async (conversationId: string, undo = false): Promise<void> => {
  requireInbox()
  try {
    await pb.send(`/backend/v1/whatsapp/conversa/${conversationId}/nao-paciente`, {
      method: 'POST',
      body: { undo },
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const linkConversation = async (
  conversationId: string,
  opportunityId?: string,
): Promise<void> => {
  requireInbox()
  try {
    await pb.send(`/backend/v1/whatsapp/conversa/${conversationId}/vincular`, {
      method: 'POST',
      body: { opportunity_id: opportunityId || '' },
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/** Chave de idempotência do rascunho: uma por abertura da caixa de resposta (RN-15). */
export const makeDraftKey = (): string =>
  'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)

export interface SendResult {
  outbound_id: string
  state: string
  reused?: boolean
  reason?: string
}

export const sendReply = async (
  conversationId: string,
  text: string,
  idempotencyKey: string,
  confirmedNotPatient = false,
): Promise<SendResult> => {
  requireInbox()
  try {
    const res = await pb.send('/backend/v1/whatsapp/enviar', {
      method: 'POST',
      body: {
        conversation_id: conversationId,
        text,
        idempotency_key: idempotencyKey,
        confirmed_not_patient: confirmedNotPatient,
      },
    })
    return res as unknown as SendResult
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface SummaryResult {
  ok?: boolean
  summary_id?: string
  summary?: string
  points?: { message_id: string; texto: string }[]
  suggested_stage?: string
  justification?: string
  clinical_signal?: boolean
  error?: string
  message?: string
  skipped?: boolean
  reason?: string
}

/**
 * AL-F4-05: pede um resumo à IA. A IA só SUGERE — nada muda na ficha sem decisão humana.
 * Sem IA configurada, devolve uma mensagem clara e a caixa continua funcionando.
 */
export const requestSummary = async (conversationId: string): Promise<SummaryResult> => {
  requireInbox()
  try {
    const res = await pb.send(`/backend/v1/conversas/${conversationId}/resumir`, {
      method: 'POST',
      body: {},
    })
    return res as unknown as SummaryResult
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const decideSummary = async (
  summaryId: string,
  action: 'aceitar' | 'recusar' | 'trocar',
  stage?: string,
): Promise<void> => {
  requireInbox()
  try {
    await pb.send(`/backend/v1/conversas/resumo/${summaryId}/decidir`, {
      method: 'POST',
      body: { action, stage: stage || '' },
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const attachmentUrl = (messageId: string): string =>
  `${pb.baseUrl}/backend/v1/whatsapp/mensagens/${messageId}/anexo`

export const isWindowOpen = (conv: Conversation): boolean => {
  if (!conv.window_expires_at) return false
  const d = new Date(conv.window_expires_at.replace(' ', 'T'))
  return !isNaN(d.getTime()) && d.getTime() > Date.now()
}

export const listTeamMembers = async (): Promise<{ id: string; name: string; role: string }[]> => {
  try {
    const list = await pb.collection('users').getList(1, 50, { sort: 'name' })
    return list.items as unknown as { id: string; name: string; role: string }[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
