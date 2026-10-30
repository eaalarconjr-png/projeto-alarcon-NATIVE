import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  askAnalysis,
  fetchPainel,
  fmtBRL,
  fmtNum,
  type AnaliseResult,
  type PainelData,
} from '@/services/painel'
import { getClinicSettings } from '@/services/crm'

const STAGE_LABELS_FALLBACK: Record<string, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  agendamento_solicitado: 'Agendamento solicitado',
  consulta_confirmada: 'Consulta confirmada',
  em_acompanhamento: 'Em acompanhamento',
  encerrado: 'Encerrado',
}

const CHANNEL_LABELS: Record<string, string> = {
  google: 'Google Ads',
  meta: 'Meta Ads',
  instagram: 'Instagram',
  outro: 'Outro',
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Painel (AL-F3-01): aquisição, andamento e resultado, com definições explícitas.
 * Pessoas ≠ oportunidades. Etapa atual é fotografia de hoje. Cancelado não conta como
 * agendamento. Mídia ausente é "indisponível", nunca zero. Sem meta definida, compara
 * canal contra canal — não inventa linha de meta (decisão do Dr., 28/10).
 */
export default function PainelPage() {
  const [data, setData] = useState<PainelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(isoDay(new Date()))
  const [stageLabels, setStageLabels] = useState<Record<string, string>>(STAGE_LABELS_FALLBACK)
  const [question, setQuestion] = useState('')
  const [analise, setAnalise] = useState<AnaliseResult | null>(null)
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)

  const ask = async () => {
    setAsking(true)
    setAskError(null)
    try {
      setAnalise(await askAnalysis(question, from, to))
    } catch (e) {
      setAskError(e instanceof Error ? e.message : 'Não foi possível analisar agora.')
    } finally {
      setAsking(false)
    }
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchPainel({ from, to }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o painel.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    getClinicSettings()
      .then((s) => setStageLabels({ ...STAGE_LABELS_FALLBACK, ...s.stage_labels }))
      .catch(() => {})
  }, [])

  const applyFilter = () => {
    load()
  }

  const d = data
  const channels = d
    ? Object.entries(d.media.by_channel).sort((a, b) => b[1].spend_cents - a[1].spend_cents)
    : []
  const profiles = d
    ? Object.entries(d.crm.by_profile).sort((a, b) => b[1].oportunidades - a[1].oportunidades)
    : []

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Painel</h1>
          <p className="text-sm text-muted-foreground">
            Aquisição, andamento e resultado. Os números seguem as definições exibidas em cada
            seção.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="from">De</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">Até</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={applyFilter} disabled={loading}>
            {loading ? 'Carregando…' : 'Aplicar'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {loading && !d ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !d ? null : (
        <>
          <p className="text-xs text-muted-foreground">
            Período: {new Date(d.period.from).toLocaleDateString('pt-BR')} a{' '}
            {new Date(d.period.to).toLocaleDateString('pt-BR')} · gerado em{' '}
            {new Date(d.generated_at).toLocaleString('pt-BR')}
          </p>

          {/* ---------- contadores principais ---------- */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Pessoas novas</CardDescription>
                <CardTitle className="text-3xl">{fmtNum(d.crm.new_contacts)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {d.definitions.pessoas}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Oportunidades novas</CardDescription>
                <CardTitle className="text-3xl">{fmtNum(d.crm.new_opportunities)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {d.definitions.oportunidades}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Consultas confirmadas</CardDescription>
                <CardTitle className="text-3xl">{fmtNum(d.agenda.consultas.confirmadas)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {d.agenda.consultas.canceladas} canceladas (não contam) ·{' '}
                {d.agenda.consultas.solicitadas} aguardando confirmação
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Resultados comerciais</CardDescription>
                <CardTitle className="text-3xl">{fmtNum(d.agenda.resultados_comerciais)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Eventos de resultado confirmados pela equipe
              </CardContent>
            </Card>
          </div>

          {/* ---------- funil ---------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funil — etapa atual</CardTitle>
              <CardDescription>{d.definitions.etapas}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-6">
              {Object.entries(d.crm.stages).length === 0 ? (
                <p className="text-sm text-muted-foreground sm:col-span-6">
                  Nenhuma oportunidade no período.
                </p>
              ) : (
                Object.entries(d.crm.stages).map(([stage, n]) => (
                  <div key={stage} className="rounded-md border border-border p-3 text-center">
                    <p className="text-2xl font-semibold">{n}</p>
                    <p className="text-xs text-muted-foreground">{stageLabels[stage] ?? stage}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* ---------- qualificação e cortes ---------- */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Qualificação</CardTitle>
                <CardDescription>Última avaliação de cada oportunidade do período.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  Completa: <strong>{d.crm.qualification.completa}</strong>
                </p>
                <p>
                  Incompleta (há critério sem dado):{' '}
                  <strong>{d.crm.qualification.incompleta}</strong>
                </p>
                <p>
                  Sem avaliação: <strong>{d.crm.qualification.sem_avaliacao}</strong>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por modalidade</CardTitle>
                <CardDescription>Particular, convênio e reembolso.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(d.crm.by_modality).length === 0 ? (
                  <p className="text-muted-foreground">Sem dados no período.</p>
                ) : (
                  Object.entries(d.crm.by_modality).map(([k, n]) => (
                    <p key={k}>
                      {k}: <strong>{n}</strong>
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por tipo de cuidado</CardTitle>
                <CardDescription>Cirúrgico e clínico.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(d.crm.by_care_type).length === 0 ? (
                  <p className="text-muted-foreground">Sem dados no período.</p>
                ) : (
                  Object.entries(d.crm.by_care_type).map(([k, n]) => (
                    <p key={k}>
                      {k}: <strong>{n}</strong>
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* ---------- por perfil ---------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por perfil de paciente</CardTitle>
              <CardDescription>
                Perfil de maior aderência de cada oportunidade. "Sem perfil" = nunca avaliada —
                nunca é distribuída entre perfis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-2">Perfil</th>
                      <th className="pb-2 text-right">Oportunidades</th>
                      <th className="pb-2 text-right">Consultas confirmadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map(([name, v]) => (
                      <tr key={name} className="border-b border-border/50">
                        <td className="py-2">{name}</td>
                        <td className="py-2 text-right tabular-nums">{v.oportunidades}</td>
                        <td className="py-2 text-right tabular-nums">{v.confirmadas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* ---------- fila e tempos ---------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fila e tempos de operação</CardTitle>
              <CardDescription>{d.definitions.tempos}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-5 text-sm">
              <div>
                <p className="text-2xl font-semibold">{d.fila.abertas}</p>
                <p className="text-xs text-muted-foreground">itens abertos</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{d.fila.sem_responsavel}</p>
                <p className="text-xs text-muted-foreground">sem responsável</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{d.fila.acao_vencida}</p>
                <p className="text-xs text-muted-foreground">prazo vencido</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">
                  {d.fila.tempo_primeira_acao_min === null
                    ? '—'
                    : `${d.fila.tempo_primeira_acao_min} min`}
                </p>
                <p className="text-xs text-muted-foreground">1ª ação no CRM (média)</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">
                  {d.fila.tempo_resposta_declarada_min === null
                    ? '—'
                    : `${d.fila.tempo_resposta_declarada_min} min`}
                </p>
                <p className="text-xs text-muted-foreground">resposta declarada (média)</p>
              </div>
            </CardContent>
          </Card>

          {/* ---------- mídia ---------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Investimento e mídia</CardTitle>
              <CardDescription>{d.media.limitacao}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!d.media.has_data ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Nenhum investimento importado para o período — os custos aparecem como
                  indisponíveis, não como zero.
                </p>
              ) : (
                <>
                  {d.media.multi_currency && (
                    <p className="text-sm text-destructive" role="alert">
                      Há mais de uma moeda nos dados importados. Os totais somam valores sem
                      conversão definida — confira antes de decidir.
                    </p>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2">Canal</th>
                        <th className="pb-2 text-right">Investimento</th>
                        <th className="pb-2 text-right">Cliques</th>
                        <th className="pb-2 text-right">Leads (plataforma)</th>
                        <th className="pb-2 text-right">Orçamento mensal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map(([p, v]) => (
                        <tr key={p} className="border-b border-border/50">
                          <td className="py-2">{CHANNEL_LABELS[p] ?? p}</td>
                          <td className="py-2 text-right tabular-nums">{fmtBRL(v.spend_cents)}</td>
                          <td className="py-2 text-right tabular-nums">{fmtNum(v.clicks)}</td>
                          <td className="py-2 text-right tabular-nums">
                            {fmtNum(v.platform_leads)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {d.media.targets[p] ? fmtBRL(d.media.targets[p]) : 'não definido'}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-2 font-medium">Total</td>
                        <td className="py-2 text-right tabular-nums font-medium">
                          {fmtBRL(d.media.total_spend_cents)}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-xs text-muted-foreground">
                    Leads da plataforma ≠ pessoas e oportunidades do CRM — números de fontes
                    diferentes, nunca somados.
                  </p>
                </>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium">
                    Custo por oportunidade:{' '}
                    {d.media.custo_por_oportunidade.value_cents === null
                      ? 'não calculável'
                      : fmtBRL(d.media.custo_por_oportunidade.value_cents)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.media.custo_por_oportunidade.motivo ??
                      `${d.definitions.custo_por_oportunidade} Divisor: ${d.media.custo_por_oportunidade.divisor}.`}
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium">
                    Custo por agendamento confirmado:{' '}
                    {d.media.custo_por_agendamento.value_cents === null
                      ? 'não calculável'
                      : fmtBRL(d.media.custo_por_agendamento.value_cents)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.media.custo_por_agendamento.motivo ??
                      `${d.definitions.custo_por_agendamento} Divisor: ${d.media.custo_por_agendamento.divisor}.`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* ---------- assistente ---------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assistente de análise</CardTitle>
              <CardDescription>
                Explica os números do período usando apenas os agregados do painel — sem acesso a
                fichas, conversas ou dados de pacientes. Não altera mídia nem decide por você.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ex.: por que a conversão caiu neste período?"
                  className="max-w-md"
                />
                <Button onClick={ask} disabled={asking}>
                  {asking ? 'Analisando…' : 'Pedir análise'}
                </Button>
              </div>
              {askError && (
                <p className="text-sm text-destructive" role="alert">
                  {askError}
                </p>
              )}
              {analise && (
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium">Números do período</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                      {analise.facts.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">Hipóteses (não são causas provadas)</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                      {analise.hypotheses.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">Próxima investigação</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                      {analise.next_steps.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-muted-foreground">{analise.limitation}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
