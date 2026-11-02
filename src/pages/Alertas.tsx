import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ALERT_KIND_LABELS,
  ALERT_PRIORITY_LABELS,
  ALERT_TARGET_LABELS,
  createAlertRule,
  deleteAlertRule,
  humanMinutes,
  listAlertRules,
  updateAlertRule,
  type AlertKind,
  type AlertPriority,
  type AlertRule,
  type AlertTarget,
} from '@/services/alertas'
import { getCurrentUser } from '@/services/auth'

interface Draft {
  name: string
  kind: AlertKind
  threshold_minutes: number
  priority: AlertPriority
  applies_to: AlertTarget
  action_hint: string
  notes: string
}

const emptyDraft = (): Draft => ({
  name: '',
  kind: 'sem_interacao',
  threshold_minutes: 3,
  priority: 'urgente',
  applies_to: 'todos',
  action_hint: '',
  notes: '',
})

const draftFrom = (r: AlertRule): Draft => ({
  name: r.name,
  kind: r.kind,
  threshold_minutes: r.threshold_minutes,
  priority: r.priority,
  applies_to: r.applies_to,
  action_hint: r.action_hint || '',
  notes: r.notes || '',
})

const PRIORITY_BADGE: Record<string, string> = {
  urgente: 'bg-red-600/15 text-red-700 dark:text-red-400',
  alta: 'bg-amber-600/15 text-amber-700 dark:text-amber-400',
  normal: 'bg-muted text-foreground',
  baixa: 'bg-muted text-muted-foreground',
}

/**
 * Réguas de alerta (pedido do Dr. 28/10). Cada régua diz quando o sistema deve cobrar a
 * equipe: tempo sem interação, antecedência de consulta, feedback pós-atendimento ou
 * reativação. O CEO cria, edita, ativa/desativa e remove — o motor lê esta lista.
 * Nada é enviado ao paciente: o alerta é interno.
 */
export default function AlertasPage() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const isAdmin = getCurrentUser()?.role === 'admin'

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setRules(await listAlertRules())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as réguas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const reset = () => {
    setEditingId(null)
    setDraft(emptyDraft())
    setFormError(null)
  }

  const startEdit = (r: AlertRule) => {
    setEditingId(r.id)
    setDraft(draftFrom(r))
    setFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    setFormError(null)
    setSaving(true)
    try {
      if (editingId) {
        await updateAlertRule(editingId, draft)
      } else {
        await createAlertRule(draft)
      }
      reset()
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Não foi possível salvar a régua.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (r: AlertRule) => {
    setError(null)
    try {
      await updateAlertRule(r.id, { active: !r.active })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível alterar a régua.')
    }
  }

  const remove = async (r: AlertRule) => {
    if (
      !window.confirm(
        `Remover a régua "${r.name}"? Esta ação não pode ser desfeita. ` +
          'Se ela já gerou alertas, use Desativar.',
      )
    ) {
      return
    }
    setError(null)
    try {
      await deleteAlertRule(r.id)
      if (editingId === r.id) reset()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover a régua.')
    }
  }

  const ativas = rules.filter((r) => r.active)
  const inativas = rules.filter((r) => !r.active)

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Réguas de alerta</h1>
        <p className="text-sm text-muted-foreground">
          Definem quando o sistema cobra a equipe. O alerta é interno (aparece na Fila) — nada é
          enviado ao paciente. Só disparam dentro do horário de funcionamento da clínica.
        </p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? 'Editar régua' : 'Nova régua de alerta'}
            </CardTitle>
            <CardDescription>
              Escolha o que a régua monitora e em quanto tempo ela deve avisar. O tempo é sempre em
              minutos (ex.: 3 = 3 minutos; 2880 = 48 horas).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="rule-name">Nome da régua *</Label>
                <Input
                  id="rule-name"
                  value={draft.name}
                  onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex.: Cirúrgico particular sem resposta · 3 min"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-kind">O que monitora *</Label>
                <select
                  id="rule-kind"
                  value={draft.kind}
                  onChange={(e) => setDraft((p) => ({ ...p, kind: e.target.value as AlertKind }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {(Object.keys(ALERT_KIND_LABELS) as AlertKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ALERT_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-target">Para quais pacientes *</Label>
                <select
                  id="rule-target"
                  value={draft.applies_to}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, applies_to: e.target.value as AlertTarget }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {(Object.keys(ALERT_TARGET_LABELS) as AlertTarget[]).map((t) => (
                    <option key={t} value={t}>
                      {ALERT_TARGET_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-minutes">Tempo (minutos) *</Label>
                <Input
                  id="rule-minutes"
                  type="number"
                  min={1}
                  value={draft.threshold_minutes}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, threshold_minutes: Number(e.target.value) }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {humanMinutes(draft.threshold_minutes)}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-priority">Prioridade *</Label>
                <select
                  id="rule-priority"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, priority: e.target.value as AlertPriority }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {(Object.keys(ALERT_PRIORITY_LABELS) as AlertPriority[]).map((pr) => (
                    <option key={pr} value={pr}>
                      {ALERT_PRIORITY_LABELS[pr]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-hint">O que a equipe deve fazer (aparece no alerta)</Label>
              <Input
                id="rule-hint"
                value={draft.action_hint}
                onChange={(e) => setDraft((p) => ({ ...p, action_hint: e.target.value }))}
                placeholder="Ex.: Ligar agora para o paciente."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-notes">Observações (opcional)</Label>
              <Input
                id="rule-notes"
                value={draft.notes}
                onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Ex.: acordado com o Dr. em 28/10"
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={submit} disabled={saving}>
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar régua'}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={reset} disabled={saving}>
                  Cancelar edição
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma régua criada. Sem régua ativa, nenhum alerta é gerado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium" role="status">
              {ativas.length} régua{ativas.length === 1 ? '' : 's'} ativa
              {ativas.length === 1 ? '' : 's'}
              {inativas.length
                ? ` · ${inativas.length} desativada${inativas.length === 1 ? '' : 's'}`
                : ''}
            </p>
            {[...ativas, ...inativas].map((r) => (
              <Card key={r.id} className={r.active ? undefined : 'opacity-60'}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {r.name}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[r.priority] ?? ''}`}
                    >
                      {ALERT_PRIORITY_LABELS[r.priority]}
                    </span>
                    {!r.active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        desativada
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {humanMinutes(r.threshold_minutes)} · {ALERT_TARGET_LABELS[r.applies_to]}
                    {r.action_hint ? ` · ${r.action_hint}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {ALERT_KIND_LABELS[r.kind]}
                  {r.notes ? ` · ${r.notes}` : ''}
                  {isAdmin && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(r)}>
                        {r.active ? 'Desativar' : 'Ativar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => remove(r)}
                      >
                        Remover
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
