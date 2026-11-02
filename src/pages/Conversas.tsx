import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AUTHOR_LABEL,
  attachmentUrl,
  decideSummary,
  requestSummary,
  type SummaryResult,
  isWindowOpen,
  LINK_STATE_LABEL,
  linkConversation,
  listConversations,
  listMessages,
  listTeamMembers,
  makeDraftKey,
  markAsMine,
  sendReply,
  setNotPatient,
  takeConversation,
  transferConversation,
  type Conversation,
  type ConversationFilter,
  type Message,
} from '@/services/conversas'

const FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'minhas', label: 'Minhas' },
  { key: 'sem_responsavel', label: 'Sem responsável' },
  { key: 'revisar', label: 'Revisar vínculo' },
  { key: 'nao_pacientes', label: 'Não pacientes' },
]

const hour = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

/**
 * Conversas (AL-F4-03): a caixa de atendimento do WhatsApp.
 * O que a equipe responde pelo celular também aparece aqui; a Clara não é tratada como
 * resposta humana. Nada é enviado a paciente sem uma pessoa clicar em Enviar.
 */
export default function ConversasPage() {
  const [filter, setFilter] = useState<ConversationFilter>('todas')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [reply, setReply] = useState('')
  const [draftKey, setDraftKey] = useState(makeDraftKey())
  const [sending, setSending] = useState(false)
  const [team, setTeam] = useState<{ id: string; name: string; role: string }[]>([])
  const [transferTo, setTransferTo] = useState('')
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  const askSummary = async () => {
    if (!selected) return
    setSummarizing(true)
    setError(null)
    setSummary(null)
    try {
      setSummary(await requestSummary(selected))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível resumir agora.')
    } finally {
      setSummarizing(false)
    }
  }

  const decide = async (action: 'aceitar' | 'recusar') => {
    if (!summary || !summary.summary_id) return
    try {
      await decideSummary(summary.summary_id, action)
      setFeedback(
        action === 'aceitar'
          ? 'Sugestão aceita e registrada com o seu nome.'
          : 'Sugestão recusada. Nada foi alterado.',
      )
      setSummary(null)
      await loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar a decisão.')
    }
  }

  const loadList = async (f: ConversationFilter = filter) => {
    setLoading(true)
    setError(null)
    try {
      const list = await listConversations(f)
      setConversations(list)
      if (!selected && list.length > 0) setSelected(list[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as conversas.')
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (id: string) => {
    setLoadingMsgs(true)
    try {
      setMessages(await listMessages(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as mensagens.')
    } finally {
      setLoadingMsgs(false)
    }
  }

  useEffect(() => {
    loadList()
    listTeamMembers()
      .then((t) => setTeam(t.filter((u) => u.role === 'admin' || u.role === 'atendimento')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (selected) loadMessages(selected)
  }, [selected])

  const conv = useMemo(
    () => conversations.find((c) => c.id === selected) || null,
    [conversations, selected],
  )
  const windowOpen = conv ? isWindowOpen(conv) : false

  const act = async (fn: () => Promise<void>, okMessage: string) => {
    setError(null)
    setFeedback(null)
    try {
      await fn()
      setFeedback(okMessage)
      await loadList()
      if (selected) await loadMessages(selected)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.')
    }
  }

  const doSend = async () => {
    if (!conv || !reply.trim()) return
    setSending(true)
    setError(null)
    setFeedback(null)
    try {
      const res = await sendReply(
        conv.id,
        reply.trim(),
        draftKey,
        conv.link_state === 'nao_paciente',
      )
      if (res.state === 'aceita') setFeedback('Mensagem aceita pelo WhatsApp.')
      else if (res.state === 'reconciliar')
        setFeedback('Envio não confirmado. Não reenvie: confira no celular antes.')
      else setFeedback('Mensagem não foi enviada: ' + (res.reason || res.state))
      setReply('')
      setDraftKey(makeDraftKey())
      await loadMessages(conv.id)
      await loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4">
      <div>
        <h1 className="text-xl font-semibold">Conversas</h1>
        <p className="text-sm text-muted-foreground">
          WhatsApp do número da clínica. O que a equipe responde pelo celular também aparece aqui.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            onClick={() => {
              setFilter(f.key)
              loadList(f.key)
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          {feedback}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
        {/* lista */}
        <div className="space-y-2">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : conversations.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Nenhuma conversa neste filtro.
              </CardContent>
            </Card>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`w-full rounded-md border p-3 text-left text-sm transition ${
                  selected === c.id ? 'border-primary bg-muted' : 'border-border hover:bg-muted/50'
                }`}
              >
                <p className="font-medium">
                  {c.expand?.contact?.name ||
                    c.contact_name_wa ||
                    c.contact_phone ||
                    'Sem telefone'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.contact_phone || '—'} · {LINK_STATE_LABEL[c.link_state]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.expand?.assignee?.name
                    ? `Resp.: ${c.expand.assignee.name}`
                    : 'Sem responsável'}
                  {c.last_inbound_at ? ` · ${hour(c.last_inbound_at)}` : ''}
                </p>
              </button>
            ))
          )}
        </div>

        {/* conversa */}
        <div>
          {!conv ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Selecione uma conversa.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {conv.expand?.contact?.name || conv.contact_name_wa || conv.contact_phone}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {LINK_STATE_LABEL[conv.link_state]}
                  </span>
                  {conv.is_fixture && (
                    <span className="rounded-full bg-blue-600/15 px-2 py-0.5 text-xs text-blue-800 dark:text-blue-300">
                      demonstração
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {conv.expand?.opportunity
                    ? `Ficha: ${conv.expand.opportunity.interest} (${conv.expand.opportunity.stage})`
                    : 'Sem ficha ligada'}
                  {' · '}
                  {windowOpen
                    ? 'Janela de resposta aberta'
                    : 'Janela de 24 h fechada — responda pelo celular'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* ações */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act(() => takeConversation(conv.id), 'Você assumiu a conversa.')}
                  >
                    Assumir
                  </Button>
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    aria-label="Transferir para"
                  >
                    <option value="">Transferir para…</option>
                    {team.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {transferTo && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act(
                          () => transferConversation(conv.id, transferTo),
                          'Conversa transferida.',
                        )
                      }
                    >
                      Transferir
                    </Button>
                  )}
                  {conv.link_state === 'nao_paciente' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act(
                          () => setNotPatient(conv.id, true),
                          'Voltou a ser tratada como paciente.',
                        )
                      }
                    >
                      Voltar a paciente
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Marcar como "não é paciente"? A oportunidade criada pelo WhatsApp será encerrada.',
                          )
                        )
                          act(() => setNotPatient(conv.id), 'Marcada como não paciente.')
                      }}
                    >
                      Não é paciente
                    </Button>
                  )}
                  {conv.link_state !== 'vinculada' && conv.link_state !== 'nao_paciente' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act(() => linkConversation(conv.id), 'Vínculo recalculado.')}
                    >
                      Vincular
                    </Button>
                  )}
                </div>

                {/* mensagens */}
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                  {loadingMsgs ? (
                    <Skeleton className="h-20 w-full" />
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem mensagens.</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-md p-2 text-sm ${
                          m.direction === 'entrada' ? 'bg-muted' : 'bg-primary/10 ml-6'
                        }`}
                      >
                        <p className="text-xs text-muted-foreground">
                          {hour(m.origin_ts)} · {AUTHOR_LABEL[m.author_kind] || m.author_kind}
                          {m.author_declared ? ' (marcada como minha)' : ''}
                          {m.status && m.direction === 'saida' ? ` · ${m.status}` : ''}
                          {m.from_history ? ' · histórico' : ''}
                        </p>
                        <p className={m.deleted ? 'italic text-muted-foreground' : ''}>
                          {m.deleted ? 'Mensagem apagada' : m.text || `[${m.type}]`}
                        </p>
                        {!m.deleted && m.type && m.type !== 'text' && (
                          <a
                            className="text-xs underline"
                            href={attachmentUrl(m.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir anexo
                          </a>
                        )}
                        {m.direction === 'saida' &&
                          m.author_kind === 'celular_ou_robo' &&
                          !m.author_declared && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-1 h-6 px-2 text-xs"
                              onClick={() =>
                                act(() => markAsMine(m.id), 'Marcada como sua resposta.')
                              }
                            >
                              Fui eu
                            </Button>
                          )}
                      </div>
                    ))
                  )}
                </div>

                {/* resposta */}
                <div className="space-y-2">
                  <Label htmlFor="reply">Responder</Label>
                  <div className="flex gap-2">
                    <Input
                      id="reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={
                        windowOpen ? 'Escreva a resposta…' : 'Janela fechada: responda pelo celular'
                      }
                      disabled={!windowOpen || sending}
                    />
                    <Button onClick={doSend} disabled={!windowOpen || sending || !reply.trim()}>
                      {sending ? 'Enviando…' : 'Enviar'}
                    </Button>
                  </div>
                  {!windowOpen && (
                    <p className="text-xs text-muted-foreground">
                      Fora da janela de 24 h só modelo aprovado (fase 5). O atendimento segue pelo
                      celular.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
