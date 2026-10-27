import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  archiveRuleVersion,
  activateRuleVersion,
  createRuleVersion,
  listRuleVersions,
  type QualificationRuleVersion,
  type RuleCriterion,
  type RuleSource,
} from '@/services/qualificacao'
import { getCurrentUser } from '@/services/auth'

const SOURCES: { value: RuleSource; label: string }[] = [
  { value: 'modalidade', label: 'Modalidade da oportunidade' },
  { value: 'origem', label: 'Origem declarada' },
  { value: 'resposta', label: 'Resposta do formulário' },
]

const STATUS_BADGE: Record<string, string> = {
  rascunho: 'bg-muted text-foreground',
  ativo: 'bg-green-600/15 text-green-700 dark:text-green-400',
  arquivado: 'bg-muted text-muted-foreground',
}

const emptyCriterion = (): RuleCriterion => ({
  id: `c${Date.now()}${Math.floor(Math.random() * 1000)}`,
  label: '',
  weight: 10,
  source: 'modalidade',
  expected: '',
})

const fmtDate = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'

/**
 * Qualificação (AL-F2-01): regras versionadas com critérios, aprovador e data.
 * Ativação é aprovação do administrador; sem regra ativa, o score fica inativo
 * (SPEC AL-F2 — não inventar pesos nem cortes).
 */
export default function RegrasQualificacaoPage() {
  const [versions, setVersions] = useState<QualificationRuleVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [criteria, setCriteria] = useState<RuleCriterion[]>([emptyCriterion()])
  const isAdmin = getCurrentUser()?.role === 'admin'

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setVersions(await listRuleVersions())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as regras.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const activeVersion = versions.find((v) => v.status === 'ativo')

  const submitDraft = async () => {
    setFormError(null)
    setSaving(true)
    try {
      await createRuleVersion(criteria, notes)
      setCriteria([emptyCriterion()])
      setNotes('')
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Não foi possível salvar o rascunho.')
    } finally {
      setSaving(false)
    }
  }

  const activate = async (id: string, versionNumber: number) => {
    if (
      !window.confirm(
        `Ativar a regra v${versionNumber}? A versão ativa anterior é arquivada e esta passa a valer ` +
          'para as próximas qualificações, com seu nome e a data de hoje registrados como aprovação.',
      )
    ) {
      return
    }
    setError(null)
    setSaving(true)
    try {
      await activateRuleVersion(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ativar a regra.')
    } finally {
      setSaving(false)
    }
  }

  const archive = async (id: string) => {
    if (
      !window.confirm('Arquivar esta regra? Ela deixa de valer, mas o histórico fica guardado.')
    ) {
      return
    }
    setError(null)
    try {
      await archiveRuleVersion(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível arquivar a regra.')
    }
  }

  const updateCriterion = (id: string, patch: Partial<RuleCriterion>) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Qualificação</h1>
        <p className="text-sm text-muted-foreground">
          Critérios que dizem se uma oportunidade adere ao padrão da clínica. A nota só existe com
          regra ativa e aprovada — nada é descartado automaticamente.
        </p>
      </div>

      {activeVersion ? (
        <p
          className="rounded-md bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300"
          role="status"
        >
          Score ativo: v{activeVersion.version_number}, aprovada em{' '}
          {fmtDate(activeVersion.approved_at)}.
        </p>
      ) : (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
          Score inativo: nenhuma regra ativa. Monte o rascunho e ative quando aprovar.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo rascunho de regra</CardTitle>
          <CardDescription>
            Cada critério tem nome, peso, origem do dado e valor esperado. A explicação da nota usa
            exatamente estes critérios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {criteria.map((c, index) => (
            <div
              key={c.id}
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
            >
              <div className="space-y-1">
                <Label htmlFor={`crit-label-${c.id}`}>Critério {index + 1} *</Label>
                <Input
                  id={`crit-label-${c.id}`}
                  value={c.label}
                  onChange={(e) => updateCriterion(c.id, { label: e.target.value })}
                  placeholder="Ex.: modalidade particular"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`crit-weight-${c.id}`}>Peso</Label>
                  <Input
                    id={`crit-weight-${c.id}`}
                    type="number"
                    min={0}
                    value={c.weight}
                    onChange={(e) => updateCriterion(c.id, { weight: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`crit-source-${c.id}`}>Origem do dado</Label>
                  <select
                    id={`crit-source-${c.id}`}
                    value={c.source}
                    onChange={(e) =>
                      updateCriterion(c.id, { source: e.target.value as RuleSource })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    {SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`crit-expected-${c.id}`}>Valor esperado *</Label>
                <Input
                  id={`crit-expected-${c.id}`}
                  value={c.expected}
                  onChange={(e) => updateCriterion(c.id, { expected: e.target.value })}
                  placeholder="Ex.: particular"
                />
              </div>
              {criteria.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive sm:col-span-2"
                  aria-label={`Remover critério ${index + 1}`}
                  onClick={() => setCriteria((prev) => prev.filter((x) => x.id !== c.id))}
                >
                  Remover critério
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCriteria((prev) => [...prev, emptyCriterion()])}
          >
            Adicionar critério
          </Button>
          <div className="space-y-1">
            <Label htmlFor="rule-notes">Observações da versão (opcional)</Label>
            <Input
              id="rule-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: aprovada na conversa com o Dr. Ernesto"
            />
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <Button onClick={submitDraft} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar rascunho'}
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
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
      ) : versions.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma versão de regra ainda. O score fica inativo até a primeira ativação.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <Card key={v.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  Versão {v.version_number}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[v.status] ?? ''}`}
                  >
                    {v.status}
                  </span>
                </CardTitle>
                <CardDescription>
                  {v.criteria.length} critério{v.criteria.length === 1 ? '' : 's'}
                  {v.expand?.approved_by?.name
                    ? ` · aprovada por ${v.expand.approved_by.name}`
                    : ''}
                  {v.status !== 'rascunho' ? ` em ${fmtDate(v.approved_at)}` : ''}
                  {v.notes ? ` · ${v.notes}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <ul className="list-disc space-y-1 pl-5">
                  {v.criteria.map((c) => (
                    <li key={c.id}>
                      <span className="font-medium">{c.label}</span> · peso {c.weight} ·{' '}
                      {SOURCES.find((s) => s.value === c.source)?.label ?? c.source} = “{c.expected}
                      ”
                    </li>
                  ))}
                </ul>
                {isAdmin && (
                  <div className="flex gap-2 pt-1">
                    {v.status === 'rascunho' && (
                      <Button
                        size="sm"
                        onClick={() => activate(v.id, v.version_number)}
                        disabled={saving}
                      >
                        Ativar regra
                      </Button>
                    )}
                    {v.status === 'ativo' && (
                      <Button size="sm" variant="outline" onClick={() => archive(v.id)}>
                        Arquivar (desativa o score)
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
