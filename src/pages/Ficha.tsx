import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getContact,
  getOpportunity,
  getStageHistory,
  type Contact,
  type HistoryEntry,
  type Opportunity,
} from '@/services/crm'

const STAGE_LABELS: Record<string, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  agendamento_solicitado: 'Agendamento solicitado',
  consulta_confirmada: 'Consulta confirmada',
  em_acompanhamento: 'Em acompanhamento',
  encerrado: 'Encerrado',
}

const ORIGIN_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp atual',
  site: 'Site',
  indicacao: 'Indicação',
  convenio_app: 'Aplicativo de convênio',
  outro: 'Outro',
  nao_identificado: 'Não identificado',
}

const MODALITY_LABELS: Record<string, string> = {
  particular: 'Particular',
  convenio: 'Convênio',
  reembolso: 'Reembolso',
}

const fmtDateTime = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

/**
 * Ficha da oportunidade (AL-F1-02): identificação, cadastro, respostas e histórico.
 * Movimentação de etapa e próximo passo entram na AL-F1-03.
 */
export default function FichaPage() {
  const { id } = useParams<{ id: string }>()
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    Promise.all([getOpportunity(id), getStageHistory(id)])
      .then(async ([op, hist]) => {
        setOpportunity(op)
        setHistory(hist)
        try {
          setContact(await getContact(op.contact))
        } catch {
          setContact(null)
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Não foi possível abrir a ficha.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !opportunity) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-destructive">{error ?? 'Ficha não encontrada.'}</p>
            <Button asChild variant="outline">
              <Link to="/">Voltar para as oportunidades</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const ownerName =
    (opportunity as unknown as { expand?: { owner?: { name?: string } } }).expand?.owner?.name ?? '—'

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Ficha da oportunidade</h1>
        <Button asChild variant="outline">
          <Link to="/">Voltar</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{contact?.name ?? 'Contato'}</CardTitle>
          <CardDescription>
            {contact?.phone ?? '—'}
            {contact?.email ? ` · ${contact.email}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Interesse declarado</p>
            <p className="font-medium">{opportunity.interest}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Modalidade</p>
            <p className="font-medium">
              {MODALITY_LABELS[opportunity.modality] ?? opportunity.modality || '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Etapa atual</p>
            <p className="font-medium">{STAGE_LABELS[opportunity.stage] ?? opportunity.stage}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Responsável</p>
            <p className="font-medium">{ownerName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Origem declarada</p>
            <p className="font-medium">
              {ORIGIN_LABELS[opportunity.origin_declared] ?? opportunity.origin_declared || '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Origem capturada</p>
            <p className="font-medium">{opportunity.origin_captured || 'Não identificada'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Próximo passo</p>
            <p className="font-medium">{opportunity.next_step || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="font-medium">
              {opportunity.status === 'encerrada' ? 'Encerrada' : 'Aberta'}
              {opportunity.close_reason ? ` — ${opportunity.close_reason}` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de etapas</CardTitle>
          <CardDescription>Cada mudança guarda autor e data</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma movimentação ainda. A oportunidade começou em “Novo”.
            </p>
          ) : (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="border-l-2 border-border pl-3">
                  <p className="text-sm font-medium">
                    {h.from_stage
                      ? `${STAGE_LABELS[h.from_stage] ?? h.from_stage} → ${STAGE_LABELS[h.to_stage] ?? h.to_stage}`
                      : `Etapa inicial: ${STAGE_LABELS[h.to_stage] ?? h.to_stage}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.expand?.author?.name ?? 'Equipe'} · {fmtDateTime(h.created)}
                    {h.note ? ` · ${h.note}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
