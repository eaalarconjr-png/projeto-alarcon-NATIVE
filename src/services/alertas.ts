// Réguas de alerta (pedido do Dr. 28/10): o CEO cria, edita, ativa/desativa e remove.
// O motor do cron lê esta coleção — nenhum prazo fica fixo no código.
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { getCurrentUser } from '@/services/auth'

export type AlertKind = 'sem_interacao' | 'antes_consulta' | 'pos_atendimento' | 'retorno'
export type AlertPriority = 'urgente' | 'alta' | 'normal' | 'baixa'
export type AlertTarget =
  | 'particular'
  | 'convenio'
  | 'reembolso'
  | 'clinico_particular'
  | 'clinico_porto'
  | 'todos'

export interface AlertRule {
  id: string
  name: string
  kind: AlertKind
  threshold_minutes: number
  priority: AlertPriority
  applies_to: AlertTarget
  action_hint: string
  active: boolean
  notes: string
  created: string
  updated: string
}

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  sem_interacao: 'Sem interação nossa (tempo desde o último contato)',
  antes_consulta: 'Antes da consulta (antecedência)',
  pos_atendimento: 'Depois do atendimento (feedback)',
  retorno: 'Retorno / reativação (tempo desde a última passagem)',
}

export const ALERT_PRIORITY_LABELS: Record<AlertPriority, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

export const ALERT_TARGET_LABELS: Record<AlertTarget, string> = {
  todos: 'Todos os pacientes',
  particular: 'Particular (cirúrgico e clínico)',
  reembolso: 'Reembolso',
  convenio: 'Convênio',
  clinico_particular: 'Clínico particular',
  clinico_porto: 'Clínico Porto Saúde',
}

/** Converte minutos em texto legível (o CEO pensa em minutos, horas, dias e meses). */
export const humanMinutes = (m: number): string => {
  if (!m) return '—'
  if (m < 60) return m === 1 ? '30 segundos' : `${m} minutos`
  if (m < 1440) {
    const h = m / 60
    return Number.isInteger(h) ? `${h} hora${h === 1 ? '' : 's'}` : `${m} minutos`
  }
  if (m < 43200) {
    const d = Math.round(m / 1440)
    return `${d} dia${d === 1 ? '' : 's'}`
  }
  const months = Math.round(m / 43200)
  return `${months} ${months === 1 ? 'mês' : 'meses'}`
}

export const listAlertRules = async (): Promise<AlertRule[]> => {
  try {
    const list = await pb.collection('alert_rules').getList(1, 200, { sort: 'kind,name' })
    return list.items as unknown as AlertRule[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface AlertRuleInput {
  name: string
  kind: AlertKind
  threshold_minutes: number
  priority: AlertPriority
  applies_to: AlertTarget
  action_hint?: string
  notes?: string
  active?: boolean
}

const validate = (data: AlertRuleInput) => {
  if (!data.name.trim() || data.name.trim().length < 3) {
    throw new Error('Dê um nome à régua (mínimo 3 letras).')
  }
  if (!(Number(data.threshold_minutes) >= 1)) {
    throw new Error('O tempo precisa ser de pelo menos 1 minuto.')
  }
}

export const createAlertRule = async (data: AlertRuleInput): Promise<AlertRule> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') throw new Error('Apenas o administrador pode criar uma régua.')
  validate(data)
  try {
    const rec = await pb.collection('alert_rules').create({
      name: data.name.trim(),
      kind: data.kind,
      threshold_minutes: Number(data.threshold_minutes),
      priority: data.priority,
      applies_to: data.applies_to,
      action_hint: data.action_hint?.trim() || '',
      notes: data.notes?.trim() || '',
      active: data.active !== false,
    })
    return rec as unknown as AlertRule
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const updateAlertRule = async (id: string, data: Partial<AlertRuleInput>): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') throw new Error('Apenas o administrador pode editar uma régua.')
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name.trim()
  if (data.kind !== undefined) patch.kind = data.kind
  if (data.threshold_minutes !== undefined) patch.threshold_minutes = Number(data.threshold_minutes)
  if (data.priority !== undefined) patch.priority = data.priority
  if (data.applies_to !== undefined) patch.applies_to = data.applies_to
  if (data.action_hint !== undefined) patch.action_hint = data.action_hint.trim()
  if (data.notes !== undefined) patch.notes = data.notes.trim()
  if (data.active !== undefined) patch.active = data.active
  try {
    await pb.collection('alert_rules').update(id, patch)
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const deleteAlertRule = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') throw new Error('Apenas o administrador pode remover uma régua.')
  try {
    await pb.collection('alert_rules').delete(id)
  } catch (error) {
    const msg = getErrorMessage(error)
    if (/relation|referenc|400/i.test(msg)) {
      throw new Error(
        'Esta régua já gerou alertas e não pode ser apagada sem perder o histórico. Use Desativar.',
      )
    }
    throw new Error(msg)
  }
}
