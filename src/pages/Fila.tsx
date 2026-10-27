import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  acknowledgeAlert,
  createServiceItem,
  declareHumanResponse,
  listAlerts,
  listServiceItems,
  setItemAssignee,
  setItemStatus,
  setWaitingHuman,
  takeServiceItem,
  type InternalAlert,
  type QueueFilter,
  type ServiceItem,
} from '@/services/fila'
import { listOpportunities, listTeam, type Opportunity, type TeamMember } from '@/services/crm'

const FILTERS: { value: QueueFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'sem_responsavel', label: 'Sem responsável' },
  { value: 'acao_vencida', label: 'Ação vencida' },
  { value: 'aguardando_retorno', label: 'Aguardando retorno' },
]

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

const STATUS_BADGE: Record<string, string> = {
  pendente: 'bg-muted text-foreground',
  em_andamento: 'bg-primary/10 text-primary',
  concluido: 'bg-green-600/15 text-green-700 dark:text-green-400',
  cancelado: 'bg-muted text-muted-foreground',
}

const fmtDateTime = (raw: string) => {
  if (!raw) return '—'
  const d = new Date(raw.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

/**
 * Fila humana (AL-F2-03): quem precisa de atenção, com responsável, próxima ação e prazo.
 * Assumir item não conta como responder o paciente — a resposta é declarada à parte.
 */
export default function FilaPage() {
  const [items, setItems] = useState<ServiceItem[]>([])
  const [alerts, setAlerts] = useState<InternalAlert[]>([])
  const [filter, setFilter] = useState<QueueFilter>('todos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState('')

  // formulário de novo item
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [oppId, setOppId] = useState('')
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [deadline, setDeadline] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [its, als] = await Promise.all([listServiceItems(filter), listAlerts(true)])
      setItems(its)
      setAlerts(als)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar a fila.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    Promise.all([listOpportunities(), listTeam()])
      .then(([ops, tm]) => {
        setOpportunities(ops)
        setTeam(tm)
      })
      .catch(() => {
        /* o formulário de criação fica vazio; a lista continua funcionando */
      })
  }, [])

  const runAction = async (itemId: string, action: () => Promise<void>) => {
    setActionError(null)
    setBusyId(itemId)
    try {
      await action()
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.')
    } finally {
      setBusyId('')
    }
  }

  const submitItem = async () => {
    setFormError(null)
    setSaving(true)
    try {
      await createServiceItem({
        opportunity: oppId,
        title,
        assignee: assignee || undefined,
        next_action: nextAction || undefined,
        deadline_at: deadline ? new Date(deadline).toISOString() : undefined,
      })
      setTitle('')
      setNextAction('')
      setDeadline('')
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Não foi possível criar o item.')
    } finally {
      setSaving(false)
    }
  }

  const contactName = (item: ServiceItem) => {
    const op = item.expand?.opportunity as unknown as
      | { expand?: { contact?: { name?: string } }; interest?: string }
      | undefined
    return op?.expand?.contact?.name ?? op?.interest ?? 'Oportunidade'
  }

  const isOverdue = (item: ServiceItem) => {
    if (!item.deadline_at) return false
    const d = new Date(item.deadline_at.replace(' ', 'T'))
    return !isNaN(d.getTime()) && d.getTime() < Date.now()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Fila de atendimento</h1>
        <p className="text-sm text-muted-foreground">
          Quem precisa de atenção agora. Assumir um item não conta como resposta — quando o paciente
          for respondido de verdade, declare a resposta no item.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo item na fila</CardTitle>
          <CardDescription>Liga uma oportunidade a uma ação humana com prazo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fila-opp">Oportunidade *</Label>
              <select
                id="fila-opp"
                value={oppId}
                onChange={(e) => setOppId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Escolha a oportunidade…</option>
                {opportunities.map((o) => {
                  const c = (o as unknown as { expand?: { contact?: { name?: string } } }).expand
                    ?.contact
                  return (
                    <option key={o.id} value={o.id}>
                      {c?.name ?? 'Contato'} · {o.interest}
                    </option>
                  )
                })}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fila-title">Item *</Label>
              <Input
                id="fila-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: retornar ligação sobre vesícula"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fila-assignee">Responsável</Label>
              <select
                id="fila-assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Sem responsável por enquanto</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="fila-deadline">Prazo</Label>
                <Input
                  id="fila-deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fila-action">Próxima ação</Label>
                <Input
                  id="fila-action"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="Ex.: ligar"
                />
              </div>
            </div>
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <Button onClick={submitItem} disabled={saving}>
            {saving ? 'Criando…' : 'Criar item'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas internos</CardTitle>
          <CardDescription>
            Itens atrasados dentro do horário configurado. Nada é enviado ao WhatsApp nesta fase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta aberto.</p>
          ) : (
            alerts.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
              >
                <p className="min-w-40 flex-1 text-sm">{a.message}</p>
                <span className="text-xs text-muted-foreground">{fmtDateTime(a.created)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(a.id, () => acknowledgeAlert(a.id))}
                  disabled={busyId === a.id}
                >
                  {busyId === a.id ? 'Reconhecendo…' : 'Reconhecer'}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={load}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Nenhum item na fila com este filtro.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-40 flex-1 font-medium">{item.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] ?? ''}`}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  {item.waiting_human && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Aguardando retorno do paciente
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {contactName(item)} ·{' '}
                  <Link to={`/oportunidades/${item.opportunity}`} className="underline">
                    abrir ficha
                  </Link>{' '}
                  · Responsável: {item.expand?.assignee?.name ?? 'ninguém ainda'} · Prazo:{' '}
                  <span className={isOverdue(item) ? 'font-medium text-destructive' : ''}>
                    {fmtDateTime(item.deadline_at)}
                    {isOverdue(item) ? ' (atrasado)' : ''}
                  </span>
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`assignee-${item.id}`}>Responsável</Label>
                    <select
                      id={`assignee-${item.id}`}
                      value={item.assignee || ''}
                      onChange={(e) =>
                        runAction(item.id, () => setItemAssignee(item.id, e.target.value))
                      }
                      disabled={busyId === item.id}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="">Sem responsável (remover)</option>
                      {team.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Primeira ação no CRM: {fmtDateTime(item.first_action_at)} · Primeira resposta
                  declarada ao paciente: {fmtDateTime(item.first_human_response_at)}
                </p>
                {actionError && busyId === item.id && (
                  <p className="text-sm text-destructive" role="alert">
                    {actionError}
                  </p>
                )}
                {item.status !== 'concluido' && item.status !== 'cancelado' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAction(item.id, () => takeServiceItem(item.id))}
                      disabled={busyId === item.id}
                    >
                      Assumir
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => runAction(item.id, () => setItemStatus(item.id, 'concluido'))}
                      disabled={busyId === item.id}
                    >
                      Concluir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAction(item.id, () => declareHumanResponse(item.id))}
                      disabled={busyId === item.id}
                    >
                      Paciente respondido (declarar)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        runAction(item.id, () => setWaitingHuman(item.id, !item.waiting_human))
                      }
                      disabled={busyId === item.id}
                    >
                      {item.waiting_human ? 'Retorno recebido' : 'Marcar aguardando retorno'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Cancelar este item da fila? Ele sai da contagem, mas fica no histórico.',
                          )
                        ) {
                          runAction(item.id, () => setItemStatus(item.id, 'cancelado'))
                        }
                      }}
                      disabled={busyId === item.id}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {actionError && !busyId && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}
    </div>
  )
}
