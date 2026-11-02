import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  formatPhone,
  getConnectionState,
  GREETING_LABEL,
  normalizePhone,
  saveConnection,
  STATUS_LABEL,
  type ChannelConnection,
  type ConnectionState,
  type GreetingMode,
} from '@/services/whatsapp'

const STATUS_STYLE: Record<string, string> = {
  conectado: 'bg-green-600/15 text-green-800 dark:text-green-300',
  desconectado: 'bg-muted text-muted-foreground',
  demonstracao: 'bg-blue-600/15 text-blue-800 dark:text-blue-300',
  erro: 'bg-red-600/15 text-red-800 dark:text-red-300',
}

/**
 * Tela WhatsApp (AL-F4-01): número, estado da conexão, segredos e permissões do canal.
 * Nada aqui conecta o número de verdade — a conexão real é a sessão da AL-F4-06, com o Dr.
 * A chave da D-API nunca aparece: a tela mostra apenas se ela está cadastrada.
 */
export default function WhatsAppPage() {
  const [state, setState] = useState<ConnectionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // formulário da conexão real
  const [label, setLabel] = useState('WhatsApp da clínica')
  const [phone, setPhone] = useState('')
  const [botActive, setBotActive] = useState(true)
  const [greetingMode, setGreetingMode] = useState<GreetingMode>('desligado')
  const [greetingOpen, setGreetingOpen] = useState('')
  const [greetingClosed, setGreetingClosed] = useState('')
  const [testPhones, setTestPhones] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await getConnectionState()
      setState(s)
      const real = s.connections.find((c) => !c.is_fixture) as ChannelConnection | undefined
      if (real) {
        setLabel(real.label || 'WhatsApp da clínica')
        setPhone(formatPhone(real.phone_number))
        setBotActive(real.other_bot_active)
        setGreetingMode(real.greeting_mode)
        setGreetingOpen(real.greeting_text_open || '')
        setGreetingClosed(real.greeting_text_closed || '')
        setTestPhones(real.greeting_test_phones || '')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar a conexão.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const real = state?.connections.find((c) => !c.is_fixture)
  const fixture = state?.connections.find((c) => c.is_fixture)

  const save = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await saveConnection({
        id: real?.id,
        label,
        phone_number: normalizePhone(phone),
        other_bot_active: botActive,
        greeting_mode: greetingMode,
        greeting_text_open: greetingOpen,
        greeting_text_closed: greetingClosed,
        greeting_test_phones: testPhones,
      })
      setSaved(true)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading)
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Skeleton className="h-64 w-full" />
      </div>
    )

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Canal oficial em coexistência: o número continua no WhatsApp Business do celular e passa a
          falar também com o CRM. A Clara e o Chatvolt seguem como estão.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* ---------- estado da conexão ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Conexão
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[real?.status || 'desconectado']}`}
            >
              {STATUS_LABEL[real?.status || 'desconectado']}
            </span>
            {real?.is_fixture && (
              <span className="rounded-full bg-blue-600/15 px-2 py-0.5 text-xs text-blue-800 dark:text-blue-300">
                demonstração
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {real
              ? 'A conexão real só é ativada na sessão com o Dr., lendo o QR no celular. Até lá, o sistema opera com dados de demonstração.'
              : 'Nenhum número cadastrado ainda. Cadastre abaixo; a ativação real acontece na sessão com o Dr.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="wa-label">Nome da conexão</Label>
              <Input id="wa-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wa-phone">Número do WhatsApp</Label>
              <Input
                id="wa-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+55 11 00000-0000"
              />
              <p className="text-xs text-muted-foreground">
                Só dígitos no envio: {normalizePhone(phone) || '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">A Clara (ou outro robô) responde neste número?</p>
              <p className="text-xs text-muted-foreground">
                Enquanto estiver sim, o acolhimento fica limitado a números de teste. É o que
                protege o atendimento que já funciona hoje.
              </p>
            </div>
            <Switch checked={botActive} onCheckedChange={setBotActive} />
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              sessionId: <strong>{real?.session_id_masked || 'ainda não vinculado'}</strong>
            </p>
            <p>
              Último evento:{' '}
              <strong>
                {real?.last_event_at
                  ? new Date(real.last_event_at.replace(' ', 'T')).toLocaleString('pt-BR')
                  : 'nenhum'}
              </strong>
            </p>
          </div>

          {saved && (
            <p className="text-sm text-green-700 dark:text-green-400" role="status">
              Salvo.
            </p>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : real ? 'Salvar conexão' : 'Cadastrar número'}
          </Button>
        </CardContent>
      </Card>

      {/* ---------- segredos ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Segredos e permissões</CardTitle>
          <CardDescription>
            A chave nunca é exibida nem gravada no navegador. Aqui você só confere se ela existe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Chave da D-API:{' '}
            <strong>{state?.secrets.DAPI_API_KEY ? 'cadastrada' : 'não cadastrada'}</strong>
          </p>
          <p>
            Token do webhook:{' '}
            <strong>{state?.secrets.DAPI_WEBHOOK_TOKEN ? 'cadastrado' : 'não cadastrado'}</strong>
          </p>
          {state?.secrets.DAPI_WEBHOOK_TOKEN_ANTERIOR && (
            <p className="text-xs text-muted-foreground">
              Há um token anterior guardado para a troca dentro de 1 hora.
            </p>
          )}
          <p className="pt-1 text-xs text-muted-foreground">{state?.rules.read_only}</p>
        </CardContent>
      </Card>

      {/* ---------- acolhimento ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acolhimento (mensagem automática)</CardTitle>
          <CardDescription>
            Texto fixo, aprovado por você. Nada de promessa de consulta nem orientação clínica. A
            equipe responde de verdade — este texto só recebe bem quem chega.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wa-greet-mode">Quando enviar</Label>
            <select
              id="wa-greet-mode"
              value={greetingMode}
              onChange={(e) => setGreetingMode(e.target.value as GreetingMode)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm sm:max-w-xs"
            >
              {(Object.keys(GREETING_LABEL) as GreetingMode[]).map((m) => (
                <option key={m} value={m}>
                  {GREETING_LABEL[m]}
                </option>
              ))}
            </select>
            {botActive && greetingMode === 'ligado' && (
              <p className="text-xs text-destructive">
                Com a Clara ativa neste número, "Ligado para todos" não é permitido. Use somente
                teste.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-greet-open">Texto dentro do horário</Label>
            <Input
              id="wa-greet-open"
              value={greetingOpen}
              onChange={(e) => setGreetingOpen(e.target.value)}
              placeholder="Olá! Aqui é a Alarcon Medical Center. A Lizandra já vai te responder neste WhatsApp."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-greet-closed">Texto fora do horário</Label>
            <Input
              id="wa-greet-closed"
              value={greetingClosed}
              onChange={(e) => setGreetingClosed(e.target.value)}
              placeholder="Olá! Aqui é a Alarcon Medical Center. Nosso atendimento é de segunda a sexta, das 8h às 18h. Assim que abrirmos, a Lizandra te responde."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-test-phones">
              Números de teste (só dígitos, separados por vírgula)
            </Label>
            <Input
              id="wa-test-phones"
              value={testPhones}
              onChange={(e) => setTestPhones(e.target.value)}
              placeholder="5511900000000"
            />
          </div>
          {real?.greeting_approved_at && (
            <p className="text-xs text-muted-foreground">
              Textos aprovados em{' '}
              {new Date(real.greeting_approved_at.replace(' ', 'T')).toLocaleString('pt-BR')}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------- fixture ---------- */}
      {fixture && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Conexão de demonstração</CardTitle>
            <CardDescription>
              Usada só para provas da fase 4. Não é o número da clínica e será removida ao final.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Número fictício: {formatPhone(fixture.phone_number)}</p>
            <p>Status: {fixture.status}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
