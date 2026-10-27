// task AL-F2-01: convênios/planos e regras de qualificação versionadas — só o serviço fala com o SDK
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { getCurrentUser } from '@/services/auth'

export type PlanPath = 'credenciado' | 'reembolso' | 'particular' | 'revisao'

export interface InsurancePlan {
  id: string
  name: string
  path: PlanPath
  notes: string
  created: string
  updated: string
}

export const PLAN_PATH_LABELS: Record<PlanPath, string> = {
  credenciado: 'Credenciado',
  reembolso: 'Reembolso',
  particular: 'Particular',
  revisao: 'Revisão humana',
}

export type RuleSource = 'modalidade' | 'origem' | 'resposta'

export interface RuleCriterion {
  id: string
  label: string
  weight: number
  source: RuleSource
  expected: string
}

export type RuleStatus = 'rascunho' | 'ativo' | 'arquivado'

export interface QualificationRuleVersion {
  id: string
  version_number: number
  status: RuleStatus
  criteria: RuleCriterion[]
  notes: string
  approved_by: string
  approved_at: string
  created: string
  updated: string
  expand?: { approved_by?: { name: string } }
}

const parseCriteria = (raw: unknown): RuleCriterion[] => {
  if (Array.isArray(raw)) return raw as RuleCriterion[]
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as RuleCriterion[]) : []
    } catch {
      // conteúdo inválido vira lista vazia; a revisão é humana
      return []
    }
  }
  return []
}

const PLAN_PATHS: PlanPath[] = ['credenciado', 'reembolso', 'particular', 'revisao']

export const listPlans = async (): Promise<InsurancePlan[]> => {
  try {
    const list = await pb.collection('insurance_plans').getList(1, 100, { sort: 'name' })
    return list.items as unknown as InsurancePlan[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface PlanInput {
  name: string
  path: PlanPath
  notes?: string
}

const validatePlan = (data: PlanInput) => {
  if (!data.name.trim() || data.name.trim().length < 2) {
    throw new Error('Informe o nome do convênio ou plano (mínimo 2 letras).')
  }
  if (!PLAN_PATHS.includes(data.path)) {
    throw new Error('Escolha o caminho de atendimento do plano.')
  }
}

export const createPlan = async (data: PlanInput): Promise<InsurancePlan> => {
  validatePlan(data)
  try {
    const rec = await pb.collection('insurance_plans').create({
      name: data.name.trim(),
      path: data.path,
      notes: data.notes?.trim() || '',
    })
    return rec as unknown as InsurancePlan
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const updatePlan = async (id: string, data: PlanInput): Promise<void> => {
  validatePlan(data)
  try {
    await pb.collection('insurance_plans').update(id, {
      name: data.name.trim(),
      path: data.path,
      notes: data.notes?.trim() || '',
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const deletePlan = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') {
    throw new Error('Apenas o administrador pode excluir um convênio ou plano.')
  }
  try {
    await pb.collection('insurance_plans').delete(id)
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const listRuleVersions = async (): Promise<QualificationRuleVersion[]> => {
  try {
    const list = await pb.collection('qualification_rule_versions').getList(1, 50, {
      sort: '-version_number',
      expand: 'approved_by',
    })
    return list.items.map((r) => {
      const base = r as unknown as QualificationRuleVersion
      // PocketBase v0.36 devolve campo json já como objeto/array — sem .get()
      return { ...base, criteria: parseCriteria((r as unknown as { criteria: unknown }).criteria) }
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const createRuleVersion = async (
  criteria: RuleCriterion[],
  notes = '',
): Promise<QualificationRuleVersion> => {
  if (criteria.length === 0) throw new Error('Adicione ao menos um critério à regra.')
  for (const c of criteria) {
    if (!c.label.trim()) throw new Error('Todo critério precisa de um nome.')
    if (!(Number(c.weight) >= 0)) {
      throw new Error(`O peso do critério "${c.label}" precisa ser zero ou positivo.`)
    }
    if (!c.expected.trim()) {
      throw new Error(`O critério "${c.label}" precisa do valor esperado.`)
    }
  }
  try {
    const last = await pb.collection('qualification_rule_versions').getList(1, 1, {
      sort: '-version_number',
    })
    // PocketBase v0.36: registros são objetos simples — ler como propriedade, nunca .get()
    const lastNumber = last.items.length
      ? Number((last.items[0] as unknown as { version_number: number }).version_number)
      : 0
    const next = Number.isFinite(lastNumber) && lastNumber > 0 ? lastNumber + 1 : 1
    const rec = await pb.collection('qualification_rule_versions').create({
      version_number: next,
      status: 'rascunho',
      criteria: JSON.stringify(criteria),
      notes: notes.trim(),
    })
    return { ...(rec as unknown as QualificationRuleVersion), criteria }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const activateRuleVersion = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') {
    throw new Error('Apenas o administrador pode ativar uma regra de qualificação.')
  }
  let criteriaCount = 0
  try {
    const target = await pb.collection('qualification_rule_versions').getOne(id)
    criteriaCount = parseCriteria((target as unknown as { criteria: unknown }).criteria).length
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
  if (criteriaCount === 0) {
    throw new Error('Regra sem critérios não pode ser ativada.')
  }
  try {
    const active = await pb.collection('qualification_rule_versions').getFullList({
      filter: pb.filter("status = 'ativo'"),
    })
    for (const r of active) {
      if (r.id !== id) {
        await pb.collection('qualification_rule_versions').update(r.id, { status: 'arquivado' })
      }
    }
    await pb.collection('qualification_rule_versions').update(id, {
      status: 'ativo',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const archiveRuleVersion = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') {
    throw new Error('Apenas o administrador pode arquivar uma regra de qualificação.')
  }
  try {
    await pb.collection('qualification_rule_versions').update(id, { status: 'arquivado' })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
