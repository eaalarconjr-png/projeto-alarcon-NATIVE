// task AL-F2-03: fila humana — só o serviço fala com o SDK
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { getCurrentUser } from '@/services/auth'

export type ServiceItemStatus = 'pendente' | 'em_andamento' | 'concluido' | 'cancelado'

export interface ServiceItem {
  id: string
  opportunity: string
  title: string
  assignee: string
  next_action: string
  deadline_at: string
  status: ServiceItemStatus
  waiting_human: boolean
  first_action_at: string
  first_human_response_at: string
  first_human_response_by: string
  last_activity_at: string
  created: string
  updated: string
  expand?: {
    assignee?: { name: string }
    opportunity?: { interest: string; contact?: string }
  }
}

export type QueueFilter = 'todos' | 'sem_responsavel' | 'acao_vencida' | 'aguardando_retorno'

export const listServiceItems = async (filter: QueueFilter = 'todos'): Promise<ServiceItem[]> => {
  try {
    const conditions: string[] = []
    const params: Record<string, string> = {}
    if (filter === 'sem_responsavel') {
      conditions.push('assignee = ""')
    }
    if (filter === 'aguardando_retorno') {
      conditions.push('waiting_human = true')
    }
    const list = await pb.collection('service_items').getList(1, 200, {
      filter: conditions.length ? pb.filter(conditions.join(' && '), params) : undefined,
      sort: '-updated',
      expand: 'assignee,opportunity,opportunity.contact',
    })
    let items = list.items as unknown as ServiceItem[]
    if (filter === 'acao_vencida') {
      const now = Date.now()
      items = items.filter((i) => {
        if (!i.deadline_at) return false
        const d = new Date(i.deadline_at.replace(' ', 'T'))
        return !isNaN(d.getTime()) && d.getTime() < now
      })
    }
    return items
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface ServiceItemInput {
  opportunity: string
  title: string
  assignee?: string
  next_action?: string
  deadline_at?: string
}

export const createServiceItem = async (data: ServiceItemInput): Promise<ServiceItem> => {
  if (!data.title.trim() || data.title.trim().length < 3) {
    throw new Error('Descreva o item da fila (mínimo 3 letras).')
  }
  if (!data.opportunity) {
    throw new Error('O item precisa estar ligado a uma oportunidade.')
  }
  try {
    const rec = await pb.collection('service_items').create({
      opportunity: data.opportunity,
      title: data.title.trim(),
      assignee: data.assignee || '',
      next_action: data.next_action?.trim() || '',
      deadline_at: data.deadline_at || '',
      status: 'pendente',
      waiting_human: false,
      last_activity_at: new Date().toISOString(),
    })
    return rec as unknown as ServiceItem
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

const nowIso = () => new Date().toISOString()

/**
 * Ação no CRM (assumir/andamento/concluir). Assumir NÃO é resposta ao paciente:
 * first_human_response_at fica em campo separado e só muda com resposta declarada.
 */
export const takeServiceItem = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  try {
    const item = await pb.collection('service_items').getOne(id)
    await pb.collection('service_items').update(id, {
      assignee: user.id,
      status: item.status === 'pendente' ? 'em_andamento' : item.status,
      first_action_at: item.first_action_at || nowIso(),
      last_activity_at: nowIso(),
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/** Troca ou remove o responsável do item (pedido do cliente, 27/10). */
export const setItemAssignee = async (id: string, assignee: string): Promise<void> => {
  try {
    await pb.collection('service_items').update(id, {
      assignee: assignee || '',
      last_activity_at: nowIso(),
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const setItemStatus = async (id: string, status: ServiceItemStatus): Promise<void> => {
  try {
    await pb.collection('service_items').update(id, {
      status,
      last_activity_at: nowIso(),
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/**
 * Resposta humana DECLARADA (data/autor) — diferente de assumir o item (SPEC AL-F2).
 */
export const declareHumanResponse = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  try {
    const item = await pb.collection('service_items').getOne(id)
    await pb.collection('service_items').update(id, {
      first_human_response_at: item.first_human_response_at || nowIso(),
      first_human_response_by: item.first_human_response_by || user.id,
      waiting_human: false,
      last_activity_at: nowIso(),
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const setWaitingHuman = async (id: string, waiting: boolean): Promise<void> => {
  try {
    await pb.collection('service_items').update(id, {
      waiting_human: waiting,
      last_activity_at: nowIso(),
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface InternalAlert {
  id: string
  item: string
  violation: string
  message: string
  recipient: string
  acknowledged_at: string
  acknowledged_by: string
  created: string
  expand?: {
    item?: { title: string }
    recipient?: { name: string }
    acknowledged_by?: { name: string }
  }
}

export const listAlerts = async (onlyOpen = false): Promise<InternalAlert[]> => {
  try {
    const filter = onlyOpen ? pb.filter('acknowledged_at = ""') : undefined
    const list = await pb.collection('internal_alerts').getList(1, 100, {
      filter,
      sort: '-created',
      expand: 'item,recipient,acknowledged_by',
    })
    return list.items as unknown as InternalAlert[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const acknowledgeAlert = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  try {
    await pb.collection('internal_alerts').update(id, {
      acknowledged_at: nowIso(),
      acknowledged_by: user.id,
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
