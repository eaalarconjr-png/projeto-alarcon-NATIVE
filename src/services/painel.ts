// AL-F3-01: cliente do painel — chama a rota de agregação (a mesma que o assistente usará).
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export interface PainelData {
  period: { from: string; to: string }
  generated_at: string
  definitions: Record<string, string>
  crm: {
    new_contacts: number
    new_opportunities: number
    total_opportunities_all_time: number
    stages: Record<string, number>
    qualification: { completa: number; incompleta: number; sem_avaliacao: number }
    by_profile: Record<string, { oportunidades: number; confirmadas: number }>
    by_modality: Record<string, number>
    by_care_type: Record<string, number>
  }
  agenda: {
    consultas: { solicitadas: number; confirmadas: number; canceladas: number; realizadas: number }
    resultados_comerciais: number
  }
  fila: {
    abertas: number
    sem_responsavel: number
    acao_vencida: number
    tempo_primeira_acao_min: number | null
    tempo_resposta_declarada_min: number | null
  }
  media: {
    has_data: boolean
    multi_currency: boolean
    currencies: Record<string, number>
    total_spend_cents: number
    by_channel: Record<
      string,
      {
        spend_cents: number
        impressions: number
        clicks: number
        platform_leads: number
        campaigns: number
      }
    >
    targets: Record<string, number | null>
    custo_por_oportunidade: { value_cents: number | null; divisor: number; motivo?: string }
    custo_por_agendamento: { value_cents: number | null; divisor: number; motivo?: string }
    sem_atribuicao_de_campanha: number
    limitacao: string
  }
}

export interface PainelFilters {
  from?: string
  to?: string
}

export const fetchPainel = async (filters: PainelFilters = {}): Promise<PainelData> => {
  try {
    const res = await pb.send('/backend/v1/painel/agregados', {
      method: 'POST',
      body: {
        from: filters.from || '',
        to: filters.to || '',
      },
    })
    return res as unknown as PainelData
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface AnaliseResult {
  period: { from: string; to: string }
  question: string
  facts: string[]
  hypotheses: string[]
  next_steps: string[]
  limitation: string
  engine: string
}

/** AL-F3-04: assistente consultivo — só agregados, nunca dado de paciente. */
export const askAnalysis = async (
  question: string,
  from: string,
  to: string,
): Promise<AnaliseResult> => {
  try {
    const res = await pb.send('/backend/v1/painel/analise', {
      method: 'POST',
      body: { question, from, to },
    })
    return res as unknown as AnaliseResult
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const fmtBRL = (cents: number | null | undefined): string =>
  typeof cents === 'number'
    ? (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'

export const fmtNum = (n: number | null | undefined): string =>
  typeof n === 'number' ? n.toLocaleString('pt-BR') : '—'
