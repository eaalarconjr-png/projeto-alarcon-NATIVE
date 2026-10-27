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

export interface EvaluationResult {
  evaluation_id: string | null
  state: 'completa' | 'incompleta' | 'nao_configurada'
  score: number | null
  explanation: ExplanationItem[]
  rule_version: number | null
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
  created: string
  expand?: {
    evaluated_by?: { name: string }
    rule_version?: { version_number: number }
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
      let explanation: ExplanationItem[] = []
      const raw = r.get('explanation')
      if (Array.isArray(raw)) explanation = raw as ExplanationItem[]
      else if (typeof raw === 'string' && raw.trim()) {
        try {
          explanation = JSON.parse(raw)
        } catch {
          explanation = []
        }
      }
      return { ...base, explanation }
    })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
