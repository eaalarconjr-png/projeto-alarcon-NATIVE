// task AL-F2-04: agenda clínica e eventos confirmados — só o serviço fala com o SDK
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { getCurrentUser } from '@/services/auth'

export type AgendaType = 'consulta' | 'cirurgia' | 'alta' | 'resultado_comercial'
export type AgendaStatus = 'solicitado' | 'confirmado' | 'remarcado' | 'cancelado' | 'realizado'

export const AGENDA_TYPE_LABELS: Record<AgendaType, string> = {
  consulta: 'Consulta',
  cirurgia: 'Cirurgia',
  alta: 'Alta',
  resultado_comercial: 'Resultado comercial',
}

export const AGENDA_STATUS_LABELS: Record<AgendaStatus, string> = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  remarcado: 'Remarcado',
  cancelado: 'Cancelado',
  realizado: 'Realizado',
}

export interface AgendaEvent {
  id: string
  opportunity: string
  type: AgendaType
  status: AgendaStatus
  event_at: string
  source: string
  note: string
  registered_by: string
  confirmed_by: string
  replaces: string
  created: string
  expand?: {
    registered_by?: { name: string }
    confirmed_by?: { name: string }
    opportunity?: { interest?: string; expand?: { contact?: { name?: string } } }
  }
}

export const listAgendaEvents = async (opportunityId: string): Promise<AgendaEvent[]> => {
  try {
    const list = await pb.collection('agenda_events').getList(1, 50, {
      filter: pb.filter('opportunity = {:o}', { o: opportunityId }),
      sort: '-event_at',
      expand: 'registered_by,confirmed_by',
    })
    return list.items as unknown as AgendaEvent[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/** Agenda geral da clínica (pedido do Dr., 27/10): todos os eventos, com o paciente. */
export const listAllAgendaEvents = async (): Promise<AgendaEvent[]> => {
  try {
    const list = await pb.collection('agenda_events').getList(1, 200, {
      sort: '-event_at',
      expand: 'registered_by,confirmed_by,opportunity,opportunity.contact',
    })
    return list.items as unknown as AgendaEvent[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface AgendaEventInput {
  opportunity: string
  type: AgendaType
  event_at: string
  source?: string
  note?: string
}

const validateInput = (data: AgendaEventInput) => {
  if (!data.opportunity) throw new Error('O evento precisa estar ligado a uma oportunidade.')
  if (!data.event_at) throw new Error('Informe a data e a hora do evento.')
  const d = new Date(data.event_at)
  if (isNaN(d.getTime())) throw new Error('Data e hora inválidas.')
}

/**
 * Lançamento manual: solicitação NÃO é confirmação (status começa em solicitado).
 * A agenda clínica oficial continua sendo a fonte da equipe; o CRM registra.
 */
export const createAgendaEvent = async (data: AgendaEventInput): Promise<AgendaEvent> => {
  validateInput(data)
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  try {
    const rec = await pb.collection('agenda_events').create({
      opportunity: data.opportunity,
      type: data.type,
      status: 'solicitado',
      event_at: data.event_at,
      source: data.source?.trim() || '',
      note: data.note?.trim() || '',
      registered_by: user.id,
    })
    return rec as unknown as AgendaEvent
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

const setStatus = async (id: string, patch: Record<string, unknown>): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  try {
    await pb.collection('agenda_events').update(id, { ...patch, confirmed_by: user.id })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const confirmEvent = async (id: string): Promise<void> =>
  setStatus(id, { status: 'confirmado' })

export const cancelEvent = async (id: string): Promise<void> =>
  setStatus(id, { status: 'cancelado' })

export const markPerformed = async (id: string): Promise<void> =>
  setStatus(id, { status: 'realizado' })

/**
 * Remarcação: cancela a data operacional anterior preservando o histórico — o registro
 * antigo vira "remarcado" e aponta para o novo (SPEC AL-F2).
 */
export const rescheduleEvent = async (id: string, newEventAt: string): Promise<AgendaEvent> => {
  if (!newEventAt) throw new Error('Informe a nova data e hora.')
  const d = new Date(newEventAt)
  if (isNaN(d.getTime())) throw new Error('Nova data e hora inválidas.')
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  try {
    const old = await pb.collection('agenda_events').getOne(id)
    const rec = await pb.collection('agenda_events').create({
      opportunity: old.opportunity,
      type: old.type,
      status: 'solicitado',
      event_at: newEventAt,
      source: old.source || '',
      note: old.note || '',
      registered_by: user.id,
      replaces: id,
    })
    await pb.collection('agenda_events').update(id, { status: 'remarcado', confirmed_by: user.id })
    return rec as unknown as AgendaEvent
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
