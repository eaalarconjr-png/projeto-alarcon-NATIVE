// task AL-F2-02: cliente da avaliação de qualificação — chama a rota do servidor
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export interface ExplanationItem {
  label: string
  weight: number
  status: 'atingido' | 'nao_atingido' | 'sem_dado' | string
  valor?: string
  motivo: string
}

export type FitLevel = 'alta' | 'media' | 'baixa'

/** Resultado de UM perfil de paciente sobre a oportunidade (pedido do Dr., 27/10). */
export interface ProfileResult {
  rule_id: string
  rule_version: number
  profile_name: string
  strategic_weight: number
  /** invalida = o perfil tem critério mal configurado; não foi julgado, não é "0%". */
  state: 'completa' | 'incompleta' | 'invalida'
  invalid_criteria?: string[]
  score: number
  max_score: number
  fit_pct: number
  fit_level: FitLevel
  rank?: number
  explanation: ExplanationItem[]
}

export interface EvaluationResult {
  evaluation_id: string | null
  state: 'completa' | 'incompleta' | 'nao_configurada'
  score: number | null
  explanation: ExplanationItem[]
  rule_version: number | null
  /** Comparativo de todos os perfis ativos, do mais pretendido ao menos. */
  results?: ProfileResult[]
  best_profile_name?: string
  best_fit_pct?: number | null
  worst_profile_name?: string
  worst_fit_pct?: number | null
  fit_pct?: number | null
}

export const evaluateOpportunity = async (opportunityId: string): Promise<EvaluationResult> => {
  try {
    const res = await pb.send('/backend/v1/qualificacao/avaliar', {
      method: 'POST',
      body: { opportunity_id: opportunityId },
    })
    return res as unknown as EvaluationResult
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface QualificationRecord {
  id: string
  opportunity: string
  rule_version: string
  state: 'completa' | 'incompleta' | 'nao_configurada'
  score: number
  explanation: ExplanationItem[]
  /** Ranking persistido de todos os perfis ativos no momento da avaliação. */
  results?: ProfileResult[]
  best_profile_name?: string
  fit_pct?: number
  created: string
  expand?: {
    evaluated_by?: { name: string }
    rule_version?: { version_number: number; profile_name?: string }
  }
}

export const listQualifications = async (opportunityId: string): Promise<QualificationRecord[]> => {
  try {
    const list = await pb.collection('qualifications').getList(1, 20, {
      filter: pb.filter('opportunity = {:o}', { o: opportunityId }),
      sort: '-created',
      expand: 'evaluated_by,rule_version',
    })
    return list.items.map((r) => {
      const base = r as unknown as QualificationRecord
      const parseJsonArray = <T>(raw: unknown): T[] => {
        // PocketBase v0.36 devolve campo json já como objeto/array — sem .get()
        if (Array.isArray(raw)) return raw as T[]
        if (typeof raw === 'string' && raw.trim()) {
          try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? (parsed as T[]) : []
          } catch {
            return []
          }
        }
        return []
      }
      return {
        ...base,
        explanation: parseJsonArray<ExplanationItem>(
          (r as unknown as { explanation: unknown }).explanation,
        ),
        results: parseJsonArray<ProfileResult>((r as unknown as { results: unknown }).results),
      }
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
