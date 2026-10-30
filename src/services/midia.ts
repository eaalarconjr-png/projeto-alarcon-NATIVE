// AL-F3-02: cliente da importação de mídia e do status dos canais.
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export interface ImportRow {
  platform: string
  account_id: string
  account_name?: string
  campaign_id: string
  campaign_name?: string
  day: string
  currency: string
  spend: number | string
  impressions?: number
  clicks?: number
  platform_leads?: number
}

export interface PreviewResult {
  total: number
  accepted_count: number
  rejected_count: number
  rejected_sample: { line: number; problems: string[] }[]
  currencies: Record<string, number>
  multi_currency: boolean
  period: { from: string | null; to: string | null }
  would_update_existing: number
  would_insert: number
  spend_total_cents: number
  warnings: string[]
}

export const previewImport = async (rows: ImportRow[]): Promise<PreviewResult> => {
  try {
    const res = await pb.send('/backend/v1/painel/importar/previa', {
      method: 'POST',
      body: { rows },
    })
    return res as unknown as PreviewResult
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const confirmImport = async (
  rows: ImportRow[],
  filename: string,
  total: number,
  rejectedCount: number,
): Promise<{ batch_id: string; inserted: number; updated: number; failed: number }> => {
  try {
    const res = await pb.send('/backend/v1/painel/importar/confirmar', {
      method: 'POST',
      body: { rows, filename, total, rejected_count: rejectedCount },
    })
    return res as unknown as { batch_id: string; inserted: number; updated: number; failed: number }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface ChannelStatus {
  platform: string
  label: string
  status: 'pendente' | 'credencial_presente' | 'via_meta'
  credentials_present: string[]
  credentials_missing: string[]
  docs_hint: string
  last_import: { last_import_at: string; last_filename: string; rows_accepted: number } | null
}

export const fetchChannelStatus = async (): Promise<{
  channels: ChannelStatus[]
  fallback: { how: string; note: string }
  guarantee: string
}> => {
  try {
    const res = await pb.send('/backend/v1/painel/canais', { method: 'GET' })
    return res as unknown as {
      channels: ChannelStatus[]
      fallback: { how: string; note: string }
      guarantee: string
    }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/** Modelo CSV com cabeçalho e uma linha de exemplo — o gestor preenche no Excel. */
export const CSV_TEMPLATE = `platform,account_name,account_id,campaign_name,campaign_id,day,currency,spend,impressions,clicks,platform_leads
google,Conta Principal,1234567890,Vesicula SP,C-101,2026-10-20,BRL,500.00,10000,250,12
meta,Conta Meta,act_9876543210,Hernia IG,M-55,2026-10-20,BRL,200.00,15000,300,20
`

/**
 * Parser CSV simples e tolerante (aspas e vírgulas dentro de campo).
 * Não tenta adivinhar formato: exige o cabeçalho do modelo.
 */
export const parseCsv = (text: string): { rows: ImportRow[]; error: string | null } => {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!clean) return { rows: [], error: 'O arquivo está vazio.' }
  const lines = clean.split('\n').filter((l) => l.trim())
  if (lines.length < 2)
    return { rows: [], error: 'O arquivo precisa de cabeçalho e ao menos uma linha.' }

  const splitLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out.map((s) => s.trim().replace(/^"|"$/g, ''))
  }

  const header = splitLine(lines[0]).map((h) => h.toLowerCase())
  const required = ['platform', 'account_id', 'campaign_id', 'day', 'currency', 'spend']
  const missing = required.filter((r) => !header.includes(r))
  if (missing.length) {
    return {
      rows: [],
      error: `Faltam colunas obrigatórias: ${missing.join(', ')}. Use o modelo fornecido.`,
    }
  }

  const rows: ImportRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    const get = (name: string) => {
      const idx = header.indexOf(name)
      return idx >= 0 ? (cells[idx] ?? '') : ''
    }
    rows.push({
      platform: get('platform'),
      account_id: get('account_id'),
      account_name: get('account_name'),
      campaign_id: get('campaign_id'),
      campaign_name: get('campaign_name'),
      day: get('day'),
      currency: get('currency'),
      spend: get('spend'),
      impressions: Number(get('impressions')) || 0,
      clicks: Number(get('clicks')) || 0,
      platform_leads: Number(get('platform_leads')) || 0,
    })
  }
  return { rows, error: null }
}
