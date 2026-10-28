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
  deleteRuleVersion,
  listRuleVersions,
  updateRuleVersion,
  CRITERION_TARGETS,
  type QualificationRuleVersion,
  type RuleCriterion,
  type RuleSource,
} from '@/services/qualificacao'
import { getCurrentUser } from '@/services/auth'

const SOURCES: { value: RuleSource; label: string }[] = [
  { value: 'modalidade', label: 'Modalidade da oportunidade' },
  { value: 'cuidado', label: 'Tipo de cuidado (cirúrgico/clínico)' },
  { value: 'origem', label: 'Origem declarada' },
  { value: 'resposta', label: 'Resposta do formulário' },
]

const STATUS_BADGE: Record<string, string> = {
  rascunho: 'bg-muted text-foreground',
  ativo: 'bg-green-600/15 text-green-700 dark:text-green-400',
  arquivado: 'bg-muted text-muted-foreground',
}

const emptyCriterion = (): RuleCriterion => ({
  id: `c${Date.now()}${Math.floor(Math.random() * 100000)}`,
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

interface Draft {
  profileName: string
  strategicWeight: number
  targetNotes: string
  notes: string
  criteria: RuleCriterion[]
}

const draftFrom = (v: QualificationRuleVersion): Draft => ({
  profileName: v.profile_name || '',
  strategicWeight: v.strategic_weight || 10,
  targetNotes: v.target_notes || '',
  notes: v.notes || '',
  criteria: v.criteria.length ? v.criteria : [emptyCriterion()],
})

/**
 * Perfis de paciente (pedido do Dr. 27/10, ajustado em 28/10).
 * Vários perfis ativos ao mesmo tempo, cada um com peso estratégico. Todo perfil pode ser
 * EDITADO (nome, peso, critérios, notas) a qualquer momento e também REMOVIDO, para a clínica
 * recalibrar sempre que quiser. Perfil já usado em avaliação não é apagado: o histórico manda.
 * O valor esperado de modalidade e origem é lista fechada — texto livre faria o perfil nunca
 * pontuar (defeito corrigido em 28/10).
 */
export default function RegrasQualificacaoPage() {
  const [versions, setVersions] = useState<QualificationRuleVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({
    profileName: '',
    strategicWeight: 10,
    targetNotes: '',
    notes: '',
    criteria: [emptyCriterion()],
  })
  const isAdmin = getCurrentUser()?.role === 'admin'

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setVersions(await listRuleVersions())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os perfis.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const activeProfiles = versions.filter((v) => v.status === 'ativo')
  const rankedActive = [...activeProfiles].sort((a, b) => b.strategic_weight - a.strategic_weight)

  const resetDraft = () => {
    setEditingId(null)
    setDraft({
      profileName: '',
      strategicWeight: 10,
      targetNotes: '',
      notes: '',
      criteria: [emptyCriterion()],
    })
    setFormError(null)
  }

  const startEdit = (v: QualificationRuleVersion) => {
    setEditingId(v.id)
    setDraft(draftFrom(v))
    setFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    setFormError(null)
    setSaving(true)
    try {
      if (editingId) {
        await updateRuleVersion(editingId, {
          profileName: draft.profileName,
          strategicWeight: draft.strategicWeight,
          targetNotes: draft.targetNotes,
          notes: draft.notes,
          criteria: draft.criteria,
        })
      } else {
        await createRuleVersion({
          criteria: draft.criteria,
          profileName: draft.profileName,
          strategicWeight: draft.strategicWeight,
          targetNotes: draft.targetNotes,
          notes: draft.notes,
        })
      }
      resetDraft()
      await load()
    } catch (e) {
      setFormError(
        e instanceof Error
          ? e.message
          : editingId
            ? 'Não foi possível salvar as alterações.'
            : 'Não foi possível salvar o perfil.',
      )
    } finally {
      setSaving(false)
    }
  }

  const activate = async (profile: QualificationRuleVersion) => {
    if (
      !window.confirm(
        `Ativar o perfil "${profile.profile_name}" (peso ${profile.strategic_weight})? ` +
          'Ele passa a concorrer com os outros perfis ativos. Os que já estão ativos continuam.',
      )
    ) {
      return
    }
    setError(null)
    setSaving(true)
    try {
      await activateRuleVersion(profile.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ativar o perfil.')
    } finally {
      setSaving(false)
    }
  }

  const archive = async (v: QualificationRuleVersion) => {
    if (
      !window.confirm(
        `Desativar o perfil "${v.profile_name}"? Ele sai do ranking dos pacientes, mas o cadastro e o histórico ficam guardados.`,
      )
    ) {
      return
    }
    setError(null)
    try {
      await archiveRuleVersion(v.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível desativar o perfil.')
    }
  }

  const remove = async (v: QualificationRuleVersion) => {
    if (
      !window.confirm(
        `Remover definitivamente o perfil "${v.profile_name}"? Esta ação não pode ser desfeita. ` +
          'Se ele já foi usado em avaliações, use Desativar.',
      )
    ) {
      return
    }
    setError(null)
    try {
      await deleteRuleVersion(v.id)
      if (editingId === v.id) resetDraft()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover o perfil.')
    }
  }

  const updateCriterion = (id: string, patch: Partial<RuleCriterion>) => {
    setDraft((prev) => ({
      ...prev,
      criteria: prev.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Perfis de paciente</h1>
        <p className="text-sm text-muted-foreground">
          Cada perfil descreve um tipo de paciente que a clínica quer atrair. Vários podem ficar
          ativos ao mesmo tempo: na ficha, o sistema compara todos e mostra qual é o mais
          pretendido. O peso estratégico define a prioridade entre eles.
        </p>
      </div>

      {rankedActive.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium" role="status">
            {rankedActive.length === 1
              ? '1 perfil ativo. Ative outros para comparar prioridades.'
              : `${rankedActive.length} perfis ativos — nesta ordem de prioridade:`}
          </p>
          <ol className="space-y-1 text-sm">
            {rankedActive.map((p, i) => (
              <li
                key={p.id}
                className="rounded-md bg-green-600/10 px-3 py-2 text-green-900 dark:text-green-300"
              >
                <span className="font-medium">
                  {i + 1}º · {p.profile_name}
                </span>{' '}
                <span className="text-xs">· peso estratégico {p.strategic_weight}</span>
                {p.target_notes ? (
                  <span className="block text-xs opacity-80">{p.target_notes}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
          Nenhum perfil ativo. Monte o perfil e ative quando aprovar — o score fica inativo até lá.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? 'Editar perfil de paciente' : 'Novo perfil de paciente'}
          </CardTitle>
          <CardDescription>
            {editingId
              ? 'Altere o que precisar e salve. O perfil calibrado passa a valer na próxima avaliação dos pacientes.'
              : 'Nomeie o perfil, dê o peso estratégico e defina os critérios. A explicação da nota usa exatamente estes critérios.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="profile-name">Nome do perfil *</Label>
              <Input
                id="profile-name"
                value={draft.profileName}
                onChange={(e) => setDraft((p) => ({ ...p, profileName: e.target.value }))}
                placeholder="Ex.: Cirurgia particular de vesícula"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-weight">Peso estratégico *</Label>
              <Input
                id="profile-weight"
                type="number"
                min={1}
                value={draft.strategicWeight}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, strategicWeight: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">Maior = mais pretendido.</p>
            </div>
          </div>

          {draft.criteria.map((c, index) => (
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
                    onChange={(e) => {
                      const source = e.target.value as RuleSource
                      // troca de origem limpa o valor: as listas são diferentes
                      updateCriterion(c.id, { source, expected: '' })
                    }}
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
                {c.source === 'resposta' ? (
                  <>
                    <Input
                      id={`crit-expected-${c.id}`}
                      value={c.expected}
                      onChange={(e) => updateCriterion(c.id, { expected: e.target.value })}
                      placeholder="Ex.: Cirurgia (texto exato da opção do formulário)"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use exatamente o texto de uma opção do formulário.
                    </p>
                  </>
                ) : (
                  <>
                    <select
                      id={`crit-expected-${c.id}`}
                      value={c.expected}
                      onChange={(e) => updateCriterion(c.id, { expected: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      <option value="">Escolha o valor…</option>
                      {CRITERION_TARGETS[c.source].map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Lista fechada: é o valor que o sistema grava na ficha.
                    </p>
                  </>
                )}
              </div>
              {draft.criteria.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive sm:col-span-2"
                  aria-label={`Remover critério ${index + 1}`}
                  onClick={() =>
                    setDraft((p) => ({ ...p, criteria: p.criteria.filter((x) => x.id !== c.id) }))
                  }
                >
                  Remover critério
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDraft((p) => ({ ...p, criteria: [...p.criteria, emptyCriterion()] }))}
          >
            Adicionar critério
          </Button>

          <div className="space-y-1">
            <Label htmlFor="profile-target">Como atrair este perfil (opcional)</Label>
            <Input
              id="profile-target"
              value={draft.targetNotes}
              onChange={(e) => setDraft((p) => ({ ...p, targetNotes: e.target.value }))}
              placeholder="Ex.: campanha no Google para vesícula particular em São Paulo"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-notes">Observações do perfil (opcional)</Label>
            <Input
              id="rule-notes"
              value={draft.notes}
              onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Ex.: aprovado na conversa com o Dr. Ernesto"
            />
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={submit} disabled={saving}>
              {saving
                ? 'Salvando…'
                : editingId
                  ? 'Salvar alterações'
                  : 'Salvar perfil como rascunho'}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetDraft} disabled={saving}>
                Cancelar edição
              </Button>
            )}
          </div>
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
              Nenhum perfil criado ainda. O score fica inativo até a primeira ativação.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <Card key={v.id} className={editingId === v.id ? 'border-primary' : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {v.profile_name || `Perfil v${v.version_number}`}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[v.status] ?? ''}`}
                  >
                    {v.status}
                  </span>
                </CardTitle>
                <CardDescription>
                  peso estratégico {v.strategic_weight} · {v.criteria.length} critério
                  {v.criteria.length === 1 ? '' : 's'}
                  {v.expand?.approved_by?.name
                    ? ` · aprovado por ${v.expand.approved_by.name}`
                    : ''}
                  {v.status !== 'rascunho' ? ` em ${fmtDate(v.approved_at)}` : ''}
                  {v.target_notes ? ` · ${v.target_notes}` : ''}
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
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => startEdit(v)}>
                      Editar
                    </Button>
                    {v.status === 'rascunho' && (
                      <Button size="sm" onClick={() => activate(v)} disabled={saving}>
                        Ativar perfil
                      </Button>
                    )}
                    {v.status === 'ativo' && (
                      <Button size="sm" variant="outline" onClick={() => archive(v)}>
                        Desativar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => remove(v)}
                    >
                      Remover
                    </Button>
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
