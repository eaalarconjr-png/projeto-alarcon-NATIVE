import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  closeOpportunity,
  getContact,
  getOpportunity,
  getStageHistory,
  moveStage,
  reopenOpportunity,
  setNextStep,
  type Contact,
  type HistoryEntry,
  type Opportunity,
} from '@/services/crm'

const STAGES = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_atendimento', label: 'Em atendimento' },
  { value: 'agendamento_solicitado', label: 'Agendamento solicitado' },
  { value: 'consulta_confirmada', label: 'Consulta confirmada' },
  { value: 'em_acompanhamento', label: 'Em acompanhamento' },
  { value: 'encerrado', label: 'Encerrado' },
]

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

  const [nextStep, setNextStep] = useState('')
  const [nextStepAt, setNextStepAt] = useState('')
  const [moveStageValue, setMoveStageValue] = useState('em_atendimento')
  const [moveNote, setMoveNote] = useState('')
  const [reopenStage, setReopenStage] = useState('novo')
  const [savingStep, setSavingStep] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = async () => {
    if (!id) return
    try {
      const op = await getOpportunity(id)
      setOpportunity(op)
      setHistory(await getStageHistory(id))
      setNextStep(op.next_step || '')
      setNextStepAt(op.next_step_at ? op.next_step_at.slice(0, 10) : '')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível atualizar a ficha.')
    }
  }

  const runAction = async (action: () => Promise<void>) => {
    setActionError(null)
    setSavingStep(true)
    try {
      await action()
      await refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.')
    } finally {
      setSavingStep(false)
    }
  }

  const saveNextStep = () =>
    runAction(() => setNextStep(id ?? '', nextStep, nextStepAt || undefined))
  const move = () => runAction(() => moveStage(id ?? '', moveStageValue, moveNote))
  const close = () =>
    runAction(async () => {
      const reason = window.prompt('Resultado ou motivo do encerramento (obrigatório):')
      if (reason === null)
        throw new Error('Encerramento cancelado: informe o motivo para encerrar.')
      await closeOpportunity(id ?? '', reason)
    })
  const reopen = () => runAction(() => reopenOpportunity(id ?? '', reopenStage))

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
    (opportunity as unknown as { expand?: { owner?: { name?: string } } }).expand?.owner?.name ??
    '—'

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
              {MODALITY_LABELS[opportunity.modality] ?? (opportunity.modality || '—')}
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
              {ORIGIN_LABELS[opportunity.origin_declared] ?? (opportunity.origin_declared || '—')}
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
          <CardTitle className="text-base">Próximo passo e movimentação</CardTitle>
          <CardDescription>
            Consulta confirmada e resultado comercial dependem de confirmação humana
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1 space-y-1">
              <Label htmlFor="next-step">Próximo passo</Label>
              <Input
                id="next-step"
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="Ex.: ligar para confirmar consulta"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="next-step-at">Data</Label>
              <Input
                id="next-step-at"
                type="date"
                value={nextStepAt}
                onChange={(e) => setNextStepAt(e.target.value)}
              />
            </div>
            <Button onClick={saveNextStep} disabled={savingStep}>
              {savingStep ? 'Salvando…' : 'Salvar próximo passo'}
            </Button>
          </div>
          {opportunity.status === 'encerrada' ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1 space-y-1">
                <Label htmlFor="reopen-stage">Reabrir na etapa</Label>
                <select
                  id="reopen-stage"
                  value={reopenStage}
                  onChange={(e) => setReopenStage(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {STAGES.filter((s) => s.value !== 'encerrado').map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="outline" onClick={reopen} disabled={savingStep}>
                {savingStep ? 'Reabrindo…' : 'Reabrir oportunidade'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1 space-y-1">
                <Label htmlFor="move-stage">Mover para a etapa</Label>
                <select
                  id="move-stage"
                  value={moveStageValue}
                  onChange={(e) => setMoveStageValue(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {STAGES.filter((s) => s.value !== opportunity.stage).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-40 flex-1 space-y-1">
                <Label htmlFor="move-note">Observação (opcional)</Label>
                <Input
                  id="move-note"
                  value={moveNote}
                  onChange={(e) => setMoveNote(e.target.value)}
                  placeholder="Anotação que entra no histórico"
                />
              </div>
              <Button onClick={move} disabled={savingStep}>
                {savingStep ? 'Movendo…' : 'Mover'}
              </Button>
              <Button variant="destructive" onClick={close} disabled={savingStep}>
                {savingStep ? 'Encerrando…' : 'Encerrar…'}
              </Button>
            </div>
          )}
          {actionError && (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          )}
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
