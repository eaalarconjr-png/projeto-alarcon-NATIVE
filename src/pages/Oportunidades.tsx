import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { listOpportunities, type Opportunity } from '@/services/crm'

const STAGE_LABELS: Record<string, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  agendamento_solicitado: 'Agendamento solicitado',
  consulta_confirmada: 'Consulta confirmada',
  em_acompanhamento: 'Em acompanhamento',
  encerrado: 'Encerrado',
}

const ORIGIN_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp atual',
  site: 'Site',
  indicacao: 'Indicação',
  convenio_app: 'Aplicativo de convênio',
  outro: 'Outro',
  nao_identificado: 'Não identificado',
}

const MODALITY_LABELS: Record<string, string> = {
  particular: 'Particular',
  convenio: 'Convênio',
  reembolso: 'Reembolso',
}

const fmtDate = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'

/**
 * Lista de oportunidades com filtros por etapa, responsável e origem (AL-F1-02).
 * A ficha completa chega na AL-F1-03; aqui a linha abre o resumo do cadastro.
 */
export default function OportunidadesPage() {
  const [items, setItems] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [origin, setOrigin] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listOpportunities({
        stage: stage || undefined,
        origin: origin || undefined,
      })
      setItems(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as oportunidades.')
    } finally {
      setLoading(false)
    }
  }, [stage, origin])

  useEffect(() => {
    load()
  }, [load])

  const filtered = search.trim()
    ? items.filter((o) => {
        const c = (o as unknown as { expand?: { contact?: { name?: string; phone?: string } } })
          .expand?.contact
        const hay = `${c?.name ?? ''} ${c?.phone ?? ''} ${o.interest}`.toLowerCase()
        return hay.includes(search.trim().toLowerCase())
      })
    : items

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">Jornadas de atendimento em andamento</p>
        </div>
        <Button asChild>
          <Link to="/contatos/novo">Novo contato</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="w-56"
          placeholder="Buscar por nome, telefone ou interesse"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar oportunidades"
        />
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filtrar por etapa"
        >
          <option value="">Todas as etapas</option>
          {Object.entries(STAGE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filtrar por origem"
        >
          <option value="">Todas as origens</option>
          {Object.entries(ORIGIN_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
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
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            {search || stage || origin ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Nenhuma oportunidade com esses filtros.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('')
                    setStage('')
                    setOrigin('')
                  }}
                >
                  Limpar filtros
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Nenhuma oportunidade ainda. Cadastre o primeiro contato para começar.
                </p>
                <Button asChild>
                  <Link to="/contatos/novo">Novo contato</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const c = (o as unknown as { expand?: { contact?: { name?: string; phone?: string } } })
              .expand?.contact
            const own = (o as unknown as { expand?: { owner?: { name?: string } } }).expand?.owner
            return (
              <Card key={o.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {c?.name ?? 'Contato'} · {o.interest}
                  </CardTitle>
                  <CardDescription>
                    {c?.phone ?? '—'} · {MODALITY_LABELS[o.modality] ?? (o.modality || '—')} ·
                    Origem: {ORIGIN_LABELS[o.origin_declared] ?? (o.origin_declared || '—')} ·
                    Responsável: {own?.name ?? '—'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                    {STAGE_LABELS[o.stage] ?? o.stage}
                  </span>
                  <span className="text-muted-foreground">Atualizada em {fmtDate(o.updated)}</span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
