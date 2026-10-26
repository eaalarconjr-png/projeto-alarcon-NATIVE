import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import type { FormQuestion, FormSchema } from '@/services/forms'

/**
 * Formulário público (AL-F1-05): serve só a versão publicada, pelo identificador público.
 * O envio passa pelo servidor (rota /backend/v1), que valida campos, limites e abuso.
 * Sem login, sem escolha de clínica, responsável ou status.
 */
export default function FormularioPublicoPage() {
  const { versionId } = useParams<{ versionId: string }>()
  const [schema, setSchema] = useState<FormSchema | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<{ submissionId: string; duplicate: boolean } | null>(null)

  useEffect(() => {
    if (!versionId) return
    setLoading(true)
    setError(null)
    pb.collection('form_versions')
      .getOne(versionId)
      .then((v) => {
        if ((v.status as string) !== 'publicada') {
          setError('Este formulário não está mais recebendo respostas.')
          setSchema(null)
        } else {
          const s = v.schema as unknown
          setSchema(typeof s === 'string' ? (JSON.parse(s) as FormSchema) : (s as FormSchema))
        }
      })
      .catch(() => setError('Formulário não encontrado ou fora do ar.'))
      .finally(() => setLoading(false))
  }, [versionId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!schema) return
    for (const q of schema.questions) {
      if (q.required && !(answers[q.id] ?? '').trim()) {
        setError(`Responda: ${q.label}`)
        return
      }
    }
    setSending(true)
    try {
      // chave de submissão: reenvio acidental do mesmo formulário não duplica
      let key = sessionStorage.getItem('submission_key')
      if (!key) {
        key = crypto.randomUUID()
        sessionStorage.setItem('submission_key', key)
      }
      const res = await pb.send(`/backend/v1/formularios/${versionId}/respostas`, {
        method: 'POST',
        body: {
          submission_key: key,
          answers,
          origin_declared: new URLSearchParams(window.location.search).get('origem') || 'site',
        },
      })
      setDone({
        submissionId: (res as { submission_id: string }).submission_id,
        duplicate: Boolean((res as { duplicate?: boolean }).duplicate),
      })
    } catch (err) {
      setError(getErrorMessage(err) || 'Não foi possível enviar. Tente novamente.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Skeleton className="h-64 w-full max-w-md" />
      </div>
    )
  }

  if (error && !schema) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center text-sm text-destructive">{error}</CardContent>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Recebemos suas respostas</CardTitle>
            <CardDescription>
              {done.duplicate
                ? 'Este envio já havia sido registrado — nada foi duplicado.'
                : 'A equipe da clínica vai entrar em contato com você.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Alarcon Medical Center
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Alarcon Medical Center</CardTitle>
          <CardDescription>Preencha para que a equipe entre em contato</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {schema?.questions.map((q: FormQuestion, idx) => (
              <div key={q.id} className="space-y-2">
                <Label htmlFor={`pub-${q.id}`}>
                  {idx + 1}. {q.label}
                  {q.required ? ' *' : ''}
                </Label>
                {q.type === 'escolha' ? (
                  <select
                    id={`pub-${q.id}`}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">Escolha…</option>
                    {q.options?.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`pub-${q.id}`}
                    type={q.type === 'telefone' ? 'tel' : 'text'}
                    inputMode={q.type === 'telefone' ? 'tel' : 'text'}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                )}
              </div>
            ))}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar respostas'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
