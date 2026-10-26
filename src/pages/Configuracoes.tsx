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
    setSaving(true)
    try {
      await updateClinicSettings({
        stage_labels: settings.stage_labels,
        credentialed_operators: operators,
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
