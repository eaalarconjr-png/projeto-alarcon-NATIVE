import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { getClinicSettings, updateClinicSettings, type ClinicSettings } from '@/services/crm'

const STAGE_KEYS = [
  { key: 'novo', label: 'Etapa 1 — entrada' },
  { key: 'em_atendimento', label: 'Etapa 2' },
  { key: 'agendamento_solicitado', label: 'Etapa 3' },
  { key: 'consulta_confirmada', label: 'Etapa 4' },
  { key: 'em_acompanhamento', label: 'Etapa 5' },
  { key: 'encerrado', label: 'Etapa 6 — fim' },
]

/**
 * Configuração da clínica (decisão do cliente, 26/10): nomes das etapas do funil
 * e operadoras credenciadas, editáveis pelo administrador a qualquer momento.
 * Somente o administrador salva (regra no servidor); a equipe lê.
 */
export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<ClinicSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [operatorsText, setOperatorsText] = useState('')

  useEffect(() => {
    getClinicSettings()
      .then((s) => {
        setSettings(s)
        setOperatorsText(s.credentialed_operators.join(', '))
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Não foi possível carregar a configuração.'),
      )
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setError(null)
    setSaved(false)
    const operators = operatorsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (operators.length === 0) {
      setError('Informe ao menos uma operadora credenciada (ou deixe "Nenhuma").')
      return
    }
    if (settings.business_hours_start && settings.business_hours_end) {
      const toMin = (v: string) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
        return m ? Number(m[1]) * 60 + Number(m[2]) : null
      }
      const s = toMin(settings.business_hours_start)
      const e = toMin(settings.business_hours_end)
      if (s === null || e === null) {
        setError('Horário de funcionamento no formato HH:MM (ex.: 08:00 e 18:00).')
        return
      }
      if (e <= s) {
        setError('O fim do horário de funcionamento precisa ser depois do início.')
        return
      }
    } else if (settings.business_hours_start || settings.business_hours_end) {
      setError('Preencha início e fim do horário de funcionamento, ou deixe os dois vazios.')
      return
    }
    setSaving(true)
    try {
      // correção 28/10: a tela não enviava horário/SLA/destinatário — os alertas nunca ligavam
      await updateClinicSettings({
        stage_labels: settings.stage_labels,
        credentialed_operators: operators,
        business_hours_start: settings.business_hours_start || '',
        business_hours_end: settings.business_hours_end || '',
        sla_minutes: Number(settings.sla_minutes) || 0,
        alert_recipient: settings.alert_recipient || '',
      })
      setSaved(true)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Não foi possível salvar. Verifique se você é administrador.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Configuração da clínica</h1>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          Configuração salva.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Etapas do funil</CardTitle>
          <CardDescription>
            Os nomes aparecem nas oportunidades e na ficha. Você pode mudá-los quando quiser — o
            histórico guarda a etapa de origem.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings &&
            STAGE_KEYS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`stage-${key}`}>{label}</Label>
                <Input
                  id={`stage-${key}`}
                  value={settings.stage_labels[key] ?? key}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      stage_labels: { ...settings.stage_labels, [key]: e.target.value },
                    })
                  }
                />
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Horário de funcionamento e prazo de atendimento
          </CardTitle>
          <CardDescription>
            Usados pelos alertas internos da fila. Fora do horário configurado, o prazo retoma na
            próxima abertura e nenhum alerta é gerado. Deixe vazio para manter os alertas
            desligados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="bh-start">Início (HH:MM)</Label>
              <Input
                id="bh-start"
                value={settings?.business_hours_start ?? ''}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, business_hours_start: e.target.value } : prev,
                  )
                }
                placeholder="08:00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bh-end">Fim (HH:MM)</Label>
              <Input
                id="bh-end"
                value={settings?.business_hours_end ?? ''}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, business_hours_end: e.target.value } : prev,
                  )
                }
                placeholder="18:00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sla-min">Prazo útil (min)</Label>
              <Input
                id="sla-min"
                type="number"
                min={0}
                value={settings?.sla_minutes ?? 0}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, sla_minutes: Number(e.target.value) } : prev,
                  )
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="alert-recipient">Destinatário dos alertas internos</Label>
            <select
              id="alert-recipient"
              value={settings?.alert_recipient ?? ''}
              onChange={(e) =>
                setSettings((prev) => (prev ? { ...prev, alert_recipient: e.target.value } : prev))
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Todos da equipe veem os alertas</option>
            </select>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar configuração'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operadoras credenciadas</CardTitle>
          <CardDescription>
            Separe por vírgula. As demais operadoras e seguradoras são atendidas por reembolso ou
            como particular — essa regra vale para os formulários e para a qualificação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="operators">Operadoras credenciadas</Label>
            <Input
              id="operators"
              value={operatorsText}
              onChange={(e) => setOperatorsText(e.target.value)}
              placeholder="Porto Seguro"
            />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar configuração'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
