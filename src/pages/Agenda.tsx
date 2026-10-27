import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AGENDA_STATUS_LABELS,
  AGENDA_TYPE_LABELS,
  listAllAgendaEvents,
  type AgendaEvent,
} from '@/services/agenda'

const fmtDateTime = (raw: string) => {
  if (!raw) return '—'
  const d = new Date(raw.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

/**
 * Agenda da clínica (AL-F2-04, ajuste do teste de 27/10): visão de todos os eventos
 * registrados, com paciente e status. O lançamento acontece na ficha da oportunidade;
 * aqui a equipe enxerga e confirma o que está marcado.
 */
export default function AgendaPage() {
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setEvents(await listAllAgendaEvents())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar a agenda.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const patientAndInterest = (ev: AgendaEvent) => {
    const op = ev.expand?.opportunity as unknown as
      | { interest?: string; expand?: { contact?: { name?: string } } }
      | undefined
    const name = op?.expand?.contact?.name
    return name ? `${name} · ${op?.interest ?? ''}` : (op?.interest ?? 'Oportunidade')
  }

  const upcoming = events.filter((e) => ['solicitado', 'confirmado'].includes(e.status))

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Agenda</h1>
        <p className="text-sm text-muted-foreground">
          Eventos registrados pela equipe (consulta, cirurgia, alta e resultado). A agenda clínica
          oficial continua sendo a fonte; aqui fica o registro no CRM.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
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
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum evento registrado ainda. Abra uma oportunidade e registre no cartão "Agenda e
              eventos confirmados".
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            {upcoming.length > 0
              ? `${upcoming.length} evento${upcoming.length === 1 ? '' : 's'} aguardando confirmação ou realização.`
              : 'Nenhum evento pendente de confirmação.'}
          </p>
          <div className="space-y-2">
            {events.map((ev) => (
              <Card key={ev.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {AGENDA_TYPE_LABELS[ev.type]} · {fmtDateTime(ev.event_at)}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {AGENDA_STATUS_LABELS[ev.status] ?? ev.status}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {patientAndInterest(ev)} ·{' '}
                    <Link to={`/oportunidades/${ev.opportunity}`} className="underline">
                      abrir ficha
                    </Link>
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Registrado por {ev.expand?.registered_by?.name ?? 'Equipe'}
                  {ev.expand?.confirmed_by?.name
                    ? ` · Confirmado por ${ev.expand.confirmed_by.name}`
                    : ''}
                  {ev.source ? ` · Fonte: ${ev.source}` : ''}
                  {ev.note ? ` · ${ev.note}` : ''}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
