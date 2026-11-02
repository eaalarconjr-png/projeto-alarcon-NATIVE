import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CSV_TEMPLATE,
  confirmImport,
  fetchChannelStatus,
  parseCsv,
  previewImport,
  type ChannelStatus,
  type ImportRow,
  type PreviewResult,
} from '@/services/midia'
import { fmtBRL } from '@/services/painel'

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pendente: {
    text: 'pendente — sem acesso de leitura',
    cls: 'bg-amber-600/15 text-amber-700 dark:text-amber-400',
  },
  credencial_presente: {
    text: 'credencial presente — aguarda validação',
    cls: 'bg-blue-600/15 text-blue-700 dark:text-blue-400',
  },
  via_meta: { text: 'entra pela conta Meta (posicionamento)', cls: 'bg-muted text-foreground' },
}

/**
 * Mídia (AL-F3-02 + AL-F3-03): importação de investimento com prévia e idempotência,
 * e o status real de cada canal de anúncio. Sem credencial, o canal fica pendente e a
 * importação cobre — nada é preenchido com zero e nada bloqueia o resto do painel.
 */
export default function MidiaPage() {
  const [channels, setChannels] = useState<ChannelStatus[]>([])
  const [guarantee, setGuarantee] = useState('')
  const [fallback, setFallback] = useState<{ how: string; note: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [done, setDone] = useState<{ inserted: number; updated: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await fetchChannelStatus()
      setChannels(s.channels)
      setGuarantee(s.guarantee)
      setFallback(s.fallback)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o status dos canais.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onFile = async (file: File) => {
    setParseError(null)
    setPreview(null)
    setDone(null)
    setFileName(file.name)
    const text = await file.text()
    const { rows: parsed, error: err } = parseCsv(text)
    if (err) {
      setParseError(err)
      setRows([])
      return
    }
    setRows(parsed)
    setWorking(true)
    try {
      setPreview(await previewImport(parsed))
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Não foi possível gerar a prévia.')
    } finally {
      setWorking(false)
    }
  }

  const doImport = async () => {
    if (!preview || rows.length === 0) return
    setWorking(true)
    setError(null)
    try {
      const res = await confirmImport(rows, fileName, preview.total, preview.rejected_count)
      setDone({ inserted: res.inserted, updated: res.updated })
      setPreview(null)
      setRows([])
      setFileName('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível importar.')
    } finally {
      setWorking(false)
    }
  }

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-importacao-midia.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Mídia e canais</h1>
        <p className="text-sm text-muted-foreground">
          Investimento das campanhas e status da leitura conectada. {guarantee}
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Canais de anúncio</CardTitle>
            <CardDescription>
              {fallback?.note} Cada canal é independente: erro em um não apaga o dado válido do
              outro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {channels.map((c) => (
              <div key={c.platform} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABEL[c.status]?.cls ?? ''}`}
                  >
                    {STATUS_LABEL[c.status]?.text ?? c.status}
                  </span>
                  {c.last_import && (
                    <span className="text-xs text-muted-foreground">
                      última importação:{' '}
                      {new Date(c.last_import.last_import_at).toLocaleString('pt-BR')} ·{' '}
                      {c.last_import.rows_accepted} linha(s)
                    </span>
                  )}
                </div>
                {c.credentials_missing.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Para conectar: {c.docs_hint} Credenciais ausentes:{' '}
                    {c.credentials_missing.join(', ')}.
                  </p>
                )}
                {c.platform === 'instagram' && (
                  <p className="mt-1 text-xs text-muted-foreground">{c.docs_hint}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar investimento (CSV)</CardTitle>
          <CardDescription>
            Fluxo com prévia: você vê o que entra antes de confirmar. Reimportar o mesmo arquivo{' '}
            <strong>não soma o gasto duas vezes</strong> — a mesma campanha/dia é atualizada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              Baixar modelo CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Escolher arquivo…
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
              }}
            />
          </div>

          {parseError && (
            <p className="text-sm text-destructive" role="alert">
              {parseError}
            </p>
          )}

          {working && <p className="text-sm text-muted-foreground">Processando…</p>}

          {preview && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Prévia — confira antes de confirmar</p>
              <div className="grid gap-1 text-sm sm:grid-cols-2">
                <p>
                  Arquivo: <strong>{fileName}</strong>
                </p>
                <p>
                  Linhas: {preview.total} · válidas: <strong>{preview.accepted_count}</strong> ·
                  rejeitadas: <strong>{preview.rejected_count}</strong>
                </p>
                <p>
                  Período: {preview.period.from?.slice(0, 10)} a {preview.period.to?.slice(0, 10)}
                </p>
                <p>
                  Investimento total: <strong>{fmtBRL(preview.spend_total_cents)}</strong>
                </p>
                <p>
                  Já existentes (serão atualizados, não somados):{' '}
                  <strong>{preview.would_update_existing}</strong>
                </p>
                <p>
                  Novos: <strong>{preview.would_insert}</strong>
                </p>
              </div>
              {preview.multi_currency && (
                <p className="text-sm text-destructive" role="alert">
                  {preview.warnings.join(' ')}
                </p>
              )}
              {preview.rejected_sample.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Linhas rejeitadas (amostra):</p>
                  <ul className="list-disc pl-5">
                    {preview.rejected_sample.slice(0, 5).map((r) => (
                      <li key={r.line}>
                        linha {r.line}: {r.problems.join('; ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button onClick={doImport} disabled={working || preview.accepted_count === 0}>
                {working
                  ? 'Importando…'
                  : `Confirmar importação (${preview.accepted_count} linhas)`}
              </Button>
            </div>
          )}

          {done && (
            <p
              className="rounded-md bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300"
              role="status"
            >
              Importação concluída: {done.inserted} nova(s) linha(s), {done.updated} atualizada(s).
              O mesmo arquivo pode ser importado de novo sem dobrar o gasto.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
