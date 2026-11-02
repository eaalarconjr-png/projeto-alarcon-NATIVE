import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  getForm,
  getLatestVersion,
  previewPath,
  publishVersion,
  saveDraftVersion,
  validateSchema,
  type FormQuestion,
  type FormSchema,
  type FormVersion,
} from '@/services/forms'

const TYPE_LABELS: Record<string, string> = {
  texto: 'Texto curto',
  telefone: 'Telefone',
  escolha: 'Escolha',
}

const newId = () => `q${Math.random().toString(36).slice(2, 8)}`

/**
 * Editor de formulário com ramificação (AL-F1-04).
 * Regras simples: resposta igual a alternativa -> próxima pergunta ou encerramento.
 * Prévia, salvar rascunho, publicar versão. Sem editor visual de fluxos (SPEC).
 */
export default function FormEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [form, setForm] = useState<{ id: string; title: string; status: string } | null>(null)
  const [schema, setSchema] = useState<FormSchema | null>(null)
  const [latest, setLatest] = useState<FormVersion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({})
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const f = await getForm(id)
      setForm({ id: f.id, title: f.title, status: f.status })
      const v = await getLatestVersion(id)
      setLatest(v)
      setSchema(v ? (v.schema as FormSchema) : { questions: [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o formulário.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const updateQuestion = (qid: string, patch: Partial<FormQuestion>) => {
    setSchema((s) =>
      s ? { ...s, questions: s.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) } : s,
    )
  }

  const addQuestion = () => {
    setSchema((s) =>
      s
        ? {
            ...s,
            questions: [
              ...s.questions,
              { id: newId(), label: '', type: 'texto', required: false, options: [], jumps: {} },
            ],
          }
        : s,
    )
  }

  const removeQuestion = (qid: string) => {
    setSchema((s) => (s ? { ...s, questions: s.questions.filter((q) => q.id !== qid) } : s))
  }

  const moveQuestion = (index: number, dir: -1 | 1) => {
    setSchema((s) => {
      if (!s) return s
      const qs = [...s.questions]
      const target = index + dir
      if (target < 0 || target >= qs.length) return s
      ;[qs[index], qs[target]] = [qs[target], qs[index]]
      return { ...s, questions: qs }
    })
  }

  const handleSaveDraft = async () => {
    if (!id || !schema) return
    const problem = validateSchema(schema)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      await saveDraftVersion(id, schema)
      setSavedMsg('Rascunho salvo.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o rascunho.')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!id || !schema) return
    const problem = validateSchema(schema)
    if (problem) {
      setError(problem)
      return
    }
    if (
      !window.confirm(
        'Publicar uma versão nova? As respostas anteriores continuam ligadas às versões que as geraram.',
      )
    )
      return
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      const v = await publishVersion(id, schema)
      setSavedMsg(`Versão ${v.version_number} publicada.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível publicar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error && !form) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button asChild variant="outline" className="mt-3">
              <Link to="/formularios">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const previewPathIds = schema && previewOpen ? previewPath(schema, previewAnswers) : []

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{form?.title}</h1>
          <p className="text-sm text-muted-foreground">
            {latest
              ? `Última versão: ${latest.version_number} (${latest.status})`
              : 'Sem versões ainda'}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/formularios">Voltar</Link>
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {savedMsg && (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          {savedMsg}
        </p>
      )}

      {schema?.questions.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma pergunta ainda. Comece adicionando a primeira.
          </CardContent>
        </Card>
      )}

      {schema?.questions.map((q, idx) => (
        <Card key={q.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Pergunta {idx + 1}</CardTitle>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveQuestion(idx, -1)}
                  aria-label="Subir pergunta"
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveQuestion(idx, 1)}
                  aria-label="Descer pergunta"
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeQuestion(q.id)}
                  aria-label="Remover pergunta"
                >
                  ✕
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`label-${q.id}`}>Texto da pergunta</Label>
              <Input
                id={`label-${q.id}`}
                value={q.label}
                onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                placeholder="Ex.: Qual procedimento você procura?"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <Label htmlFor={`type-${q.id}`}>Tipo de resposta</Label>
                <select
                  id={`type-${q.id}`}
                  value={q.type}
                  onChange={(e) =>
                    updateQuestion(q.id, {
                      type: e.target.value as FormQuestion['type'],
                      options:
                        e.target.value === 'escolha'
                          ? q.options?.length
                            ? q.options
                            : [
                                { id: newId(), label: '' },
                                { id: newId(), label: '' },
                              ]
                          : q.options,
                    })
                  }
                  className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="texto">Texto curto</option>
                  <option value="telefone">Telefone</option>
                  <option value="escolha">Escolha</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Switch
                  id={`req-${q.id}`}
                  checked={q.required}
                  onCheckedChange={(v) => updateQuestion(q.id, { required: v })}
                />
                <Label htmlFor={`req-${q.id}`}>Obrigatória</Label>
              </div>
            </div>

            {q.type === 'escolha' && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <Label>Alternativas e caminhos</Label>
                <p className="text-xs text-muted-foreground">
                  Para cada alternativa, escolha o que acontece depois: seguir para a próxima
                  pergunta, pular para uma pergunta específica ou encerrar.
                </p>
                {q.options?.map((opt, oi) => (
                  <div key={opt.id} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-40 flex-1"
                      value={opt.label}
                      onChange={(e) => {
                        const options = [...(q.options ?? [])]
                        options[oi] = { ...opt, label: e.target.value }
                        updateQuestion(q.id, { options })
                      }}
                      placeholder={`Alternativa ${oi + 1}`}
                    />
                    <select
                      value={q.jumps?.[opt.id] ?? 'pergunta'}
                      onChange={(e) => {
                        const jumps = { ...(q.jumps ?? {}), [opt.id]: e.target.value }
                        updateQuestion(q.id, { jumps })
                      }}
                      className="flex h-9 rounded-md border border-input bg-background px-2 text-sm"
                      aria-label={`Caminho da alternativa ${oi + 1}`}
                    >
                      <option value="pergunta">Próxima pergunta</option>
                      <option value="fim">Encerrar</option>
                      {schema.questions
                        .filter((t) => t.id !== q.id)
                        .map((t, ti) => (
                          <option key={t.id} value={t.id}>
                            Ir para pergunta {schema.questions.indexOf(t) + 1}
                          </option>
                        ))}
                      {oi === 0 && <option value="" disabled hidden></option>}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remover alternativa"
                      onClick={() => {
                        const options = (q.options ?? []).filter((_, i) => i !== oi)
                        updateQuestion(q.id, { options })
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateQuestion(q.id, {
                      options: [...(q.options ?? []), { id: newId(), label: '' }],
                    })
                  }
                >
                  Adicionar alternativa
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={addQuestion}>
          Adicionar pergunta
        </Button>
        <Button
          variant="outline"
          onClick={() => setPreviewOpen((v) => !v)}
          disabled={!schema || schema.questions.length === 0}
        >
          {previewOpen ? 'Fechar prévia' : 'Prévia'}
        </Button>
        <Button onClick={handleSaveDraft} disabled={saving || !schema}>
          {saving ? 'Salvando…' : 'Salvar rascunho'}
        </Button>
        <Button onClick={handlePublish} disabled={saving || !schema}>
          {saving ? 'Publicando…' : 'Publicar versão'}
        </Button>
      </div>

      {previewOpen && schema && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prévia — responda como se fosse o paciente</CardTitle>
            <CardDescription>
              O caminho percorrido aparece embaixo, na ordem em que as perguntas aparecem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {schema.questions.map((q, idx) => (
              <div key={q.id} className="space-y-1">
                <Label htmlFor={`pv-${q.id}`}>
                  {idx + 1}. {q.label || '(sem texto)'}
                  {q.required ? ' *' : ''}
                </Label>
                {q.type === 'escolha' ? (
                  <select
                    id={`pv-${q.id}`}
                    value={previewAnswers[q.id] ?? ''}
                    onChange={(e) =>
                      setPreviewAnswers({ ...previewAnswers, [q.id]: e.target.value })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Escolha…</option>
                    {q.options?.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label || '(sem texto)'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`pv-${q.id}`}
                    value={previewAnswers[q.id] ?? ''}
                    onChange={(e) =>
                      setPreviewAnswers({ ...previewAnswers, [q.id]: e.target.value })
                    }
                    inputMode={q.type === 'telefone' ? 'tel' : 'text'}
                  />
                )}
              </div>
            ))}
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">Caminho desta resposta:</p>
              <p className="text-muted-foreground">
                {previewPathIds.length === 0
                  ? 'Responda para ver o caminho.'
                  : previewPathIds
                      .map((qid) => {
                        const q = schema.questions.find((x) => x.id === qid)
                        return q
                          ? `${schema.questions.indexOf(q) + 1}. ${q.label || '(sem texto)'}`
                          : ''
                      })
                      .join(' → ')}
                {' → fim'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
