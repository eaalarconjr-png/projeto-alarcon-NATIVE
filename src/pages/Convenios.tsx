import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createPlan,
  deletePlan,
  listPlans,
  updatePlan,
  PLAN_PATH_LABELS,
  type InsurancePlan,
  type PlanPath,
} from '@/services/qualificacao'
import { getCurrentUser } from '@/services/auth'

const PATHS: PlanPath[] = ['credenciado', 'reembolso', 'particular', 'revisao']

const pathBadge = (path: string) => {
  const map: Record<string, string> = {
    credenciado: 'bg-primary/10 text-primary',
    reembolso: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    particular: 'bg-muted text-foreground',
    revisao: 'bg-destructive/10 text-destructive',
  }
  return map[path] ?? 'bg-muted text-foreground'
}

/**
 * Convênios e planos (AL-F2-01): o caminho de atendimento de cada plano.
 * Reembolso segue jornada particular; credenciado segue o atendimento dele;
 * plano não cadastrado fica para revisão (SPEC AL-F2).
 */
export default function ConveniosPage() {
  const [plans, setPlans] = useState<InsurancePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isAdmin = getCurrentUser()?.role === 'admin'

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [path, setPath] = useState<PlanPath>('particular')
  const [notes, setNotes] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setPlans(await listPlans())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os convênios.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setPath('particular')
    setNotes('')
    setFormError(null)
  }

  const submit = async () => {
    setFormError(null)
    setSaving(true)
    try {
      if (editingId) {
        await updatePlan(editingId, { name, path, notes })
      } else {
        await createPlan({ name, path, notes })
      }
      resetForm()
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Não foi possível salvar o plano.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (plan: InsurancePlan) => {
    if (!window.confirm(`Excluir o plano "${plan.name}"? Esta ação não pode ser desfeita.`)) return
    setError(null)
    try {
      await deletePlan(plan.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir o plano.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Convênios e planos</h1>
        <p className="text-sm text-muted-foreground">
          O caminho de atendimento de cada plano. Reembolso segue jornada particular; credenciado
          segue o atendimento do convênio; plano não cadastrado fica para revisão.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editingId ? 'Editar plano' : 'Novo plano'}</CardTitle>
          <CardDescription>
            Operadoras credenciadas da clínica ficam na Configuração — esta lista define como cada
            plano é atendido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="plan-name">Nome do convênio ou plano *</Label>
              <Input
                id="plan-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Bradesco Saúde"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-path">Caminho de atendimento *</Label>
              <select
                id="plan-path"
                value={path}
                onChange={(e) => setPath(e.target.value as PlanPath)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {PATHS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_PATH_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-notes">Observações (opcional)</Label>
            <Input
              id="plan-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: reembolso exige guia prévia"
            />
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar plano'}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm} disabled={saving}>
                Cancelar edição
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum plano cadastrado ainda. Cadastre o primeiro acima.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardContent className="flex flex-wrap items-center gap-2 p-4">
                <div className="min-w-40 flex-1">
                  <p className="font-medium">{plan.name}</p>
                  {plan.notes && <p className="text-xs text-muted-foreground">{plan.notes}</p>}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${pathBadge(plan.path)}`}
                >
                  {PLAN_PATH_LABELS[plan.path] ?? plan.path}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(plan.id)
                    setName(plan.name)
                    setPath(plan.path)
                    setNotes(plan.notes || '')
                    setFormError(null)
                  }}
                >
                  Editar
                </Button>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    aria-label={`Excluir plano ${plan.name}`}
                    onClick={() => remove(plan)}
                  >
                    Excluir
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
