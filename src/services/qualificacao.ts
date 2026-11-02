// task AL-F2-01 + pedido do Dr. Ernesto (27/10): PERFIS de paciente com peso estratégico.
// Diferente de "versão que substitui": vários perfis ficam ATIVOS AO MESMO TEMPO, cada um com
// seu peso estratégico (prioridade declarada pela clínica) e seus critérios. A avaliação roda
// todos e devolve o ranking — o perfil mais pretendido e o menos pretendido.
// Só o serviço fala com o SDK.
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

// 'cuidado' foi acrescentado em 28/10: sem ele, "Cirúrgico Porto Saúde" e "Clínico da Porto
// Saúde" ficam com critérios idênticos (modalidade = convenio) e empatam sempre — o ranking
// vira sorteio do peso. O tipo de cuidado separa cirúrgico de clínico.
export type RuleSource = 'modalidade' | 'origem' | 'cuidado' | 'resposta'

/**
 * Valores VÁLIDOS de cada origem de dado — os mesmos gravados na ficha da oportunidade.
 * Correção de 28/10: o "valor esperado" era texto livre e o Dr. digitou descrições
 * ("Valor de Particular") em vez de `particular`; nenhum perfil conseguia pontuar.
 * Agora a tela oferece esta lista fechada e o serviço recusa valor fora dela.
 */
export const CRITERION_TARGETS: Record<
  'modalidade' | 'origem',
  { value: string; label: string }[]
> = {
  modalidade: [
    { value: 'particular', label: 'Particular' },
    { value: 'convenio', label: 'Convênio' },
    { value: 'reembolso', label: 'Reembolso' },
  ],
  origem: [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'site', label: 'Site' },
    { value: 'indicacao', label: 'Indicação' },
    { value: 'convenio_app', label: 'App do convênio' },
    { value: 'outro', label: 'Outro' },
    { value: 'nao_identificado', label: 'Não identificado' },
  ],
}

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
  profile_name: string
  strategic_weight: number
  target_notes: string
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
    const list = await pb.collection('qualification_rule_versions').getList(1, 100, {
      sort: '-strategic_weight,-version_number',
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

export interface RuleVersionInput {
  criteria: RuleCriterion[]
  profileName: string
  strategicWeight: number
  targetNotes?: string
  notes?: string
}

const validateRule = (data: RuleVersionInput) => {
  if (!data.profileName.trim() || data.profileName.trim().length < 3) {
    throw new Error('Dê um nome ao perfil de paciente (mínimo 3 letras).')
  }
  const weight = Number(data.strategicWeight)
  if (!(weight >= 1)) {
    throw new Error('O peso estratégico do perfil precisa ser 1 ou mais.')
  }
  if (data.criteria.length === 0) throw new Error('Adicione ao menos um critério ao perfil.')
  for (const c of data.criteria) {
    if (!c.label.trim()) throw new Error('Todo critério precisa de um nome.')
    if (!(Number(c.weight) >= 0)) {
      throw new Error(`O peso do critério "${c.label}" precisa ser zero ou positivo.`)
    }
    if (!c.expected.trim()) {
      throw new Error(`O critério "${c.label}" precisa do valor esperado.`)
    }
    if (c.source === 'modalidade' || c.source === 'origem' || c.source === 'cuidado') {
      const allowed = CRITERION_TARGETS[c.source].map((t) => t.value)
      if (!allowed.includes(c.expected.trim())) {
        throw new Error(
          `O critério "${c.label}" precisa de um valor da lista (${CRITERION_TARGETS[c.source]
            .map((t) => t.label)
            .join(', ')}).`,
        )
      }
    }
  }
}

/** Cria um PERFIL de paciente (rascunho). Vários podem ficar ativos ao mesmo tempo. */
export const createRuleVersion = async (
  data: RuleVersionInput,
): Promise<QualificationRuleVersion> => {
  validateRule(data)
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
      profile_name: data.profileName.trim(),
      strategic_weight: Number(data.strategicWeight),
      target_notes: data.targetNotes?.trim() || '',
      status: 'rascunho',
      criteria: JSON.stringify(data.criteria),
      notes: data.notes?.trim() || '',
    })
    return {
      ...(rec as unknown as QualificationRuleVersion),
      criteria: data.criteria,
    }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/**
 * Ativa um perfil. DIFERENTE da versão anterior: NÃO arquiva os outros perfis ativos.
 * Vários perfis podem coexistir — é o que permite comparar qual paciente a clínica quer mais.
 */
export const activateRuleVersion = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') {
    throw new Error('Apenas o administrador pode ativar um perfil de qualificação.')
  }
  let criteriaCount = 0
  try {
    const target = await pb.collection('qualification_rule_versions').getOne(id)
    criteriaCount = parseCriteria((target as unknown as { criteria: unknown }).criteria).length
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
  if (criteriaCount === 0) {
    throw new Error('Perfil sem critérios não pode ser ativado.')
  }
  try {
    await pb.collection('qualification_rule_versions').update(id, {
      status: 'ativo',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/** Atualiza peso estratégico / nome / critérios de um perfil (admin). */
export const updateRuleVersion = async (
  id: string,
  data: Partial<RuleVersionInput>,
): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') {
    throw new Error('Apenas o administrador pode editar um perfil de qualificação.')
  }
  const patch: Record<string, unknown> = {}
  if (data.profileName !== undefined) patch.profile_name = data.profileName.trim()
  if (data.strategicWeight !== undefined) patch.strategic_weight = Number(data.strategicWeight)
  if (data.targetNotes !== undefined) patch.target_notes = data.targetNotes.trim()
  if (data.notes !== undefined) patch.notes = data.notes.trim()
  if (data.criteria !== undefined) {
    if (data.criteria.length === 0) throw new Error('Adicione ao menos um critério ao perfil.')
    patch.criteria = JSON.stringify(data.criteria)
  }
  try {
    await pb.collection('qualification_rule_versions').update(id, patch)
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const archiveRuleVersion = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') {
    throw new Error('Apenas o administrador pode desativar um perfil de qualificação.')
  }
  try {
    await pb.collection('qualification_rule_versions').update(id, { status: 'arquivado' })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/**
 * Remove o perfil de vez (pedido do Dr., 28/10). Perfil já usado em alguma avaliação
 * não pode ser apagado — o histórico da ficha ficaria sem referência. Nesse caso a
 * mensagem orienta a desativar em vez de excluir.
 */
export const deleteRuleVersion = async (id: string): Promise<void> => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') {
    throw new Error('Apenas o administrador pode remover um perfil de qualificação.')
  }
  try {
    await pb.collection('qualification_rule_versions').delete(id)
  } catch (error) {
    const msg = getErrorMessage(error)
    if (/relation|referenc|400/i.test(msg)) {
      throw new Error(
        'Este perfil já foi usado em avaliações de pacientes e não pode ser apagado sem perder o histórico. Use “Desativar” para tirá-lo do ranking.',
      )
    }
    throw new Error(msg)
  }
}
