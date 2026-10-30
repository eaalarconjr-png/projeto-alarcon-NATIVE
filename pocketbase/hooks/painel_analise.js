// AL-F3-04: assistente de análise das campanhas.
// Regras da SPEC: responde com números/período, hipóteses nomeadas e próxima investigação;
// não atribui causalidade; com pouca base declara a limitação; NÃO cria/pausa anúncio, não
// altera orçamento, não move paciente. Somente agregados — nenhum dado clínico.
// Implementação determinística sobre os mesmos agregados do painel: funciona sem chave de IA
// externa e nunca diverge dos números exibidos. Um modelo de linguagem pode ser ligado depois
// consumindo esta mesma resposta.
routerAdd(
  'POST',
  '/backend/v1/painel/analise',
  (e) => {
    const body = e.requestInfo().body || {}
    const from = String(body.from || '')
    const to = String(body.to || '')
    const question = String(body.question || '').trim()

    const now = new Date()
    const msDay = 86400000
    const toDate = (s, endOfDay) => {
      if (!s) return null
      const d = new Date(String(s).replace(' ', 'T') + (endOfDay ? 'T23:59:59' : 'T00:00:00'))
      return isNaN(d.getTime()) ? null : d
    }
    let start = toDate(from, false) || new Date(now.getTime() - 30 * msDay)
    let end = toDate(to, true) || now
    if (start.getTime() > end.getTime()) {
      const t = start
      start = end
      end = t
    }
    const inPeriod = (raw) => {
      if (!raw) return false
      const d = new Date(String(raw).replace(' ', 'T'))
      return !isNaN(d.getTime()) && d.getTime() >= start.getTime() && d.getTime() <= end.getTime()
    }
    // goja (JSVM) não tem Intl confiável — formata data e moeda à mão
    const fmtBR = (d) => d.getUTCDate() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCFullYear()
    const brl = (cents) => 'R$ ' + (cents / 100).toFixed(2).replace('.', ',')
    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) + '%' : 'não calculável')

    const contacts = $app.findRecordsByFilter('contacts', '', '', 5000, 0)
    const newContacts = contacts.filter((c) => inPeriod(c.getString('created'))).length
    const ops = $app.findRecordsByFilter('opportunities', '', '-created', 5000, 0)
    const periodOps = ops.filter((o) => inPeriod(o.getString('created')))
    const quals = $app.findRecordsByFilter('qualifications', '', '-created', 5000, 0)
    const lastQualByOp = {}
    for (const q of quals) {
      const opId = q.getString('opportunity')
      if (!lastQualByOp[opId]) lastQualByOp[opId] = q
    }
    let qualCompleta = 0
    const byProfile = {}
    for (const o of periodOps) {
      const q = lastQualByOp[o.id]
      if (q && q.getString('state') === 'completa') qualCompleta++
      const profile = (q && q.getString('best_profile_name')) || 'sem perfil'
      if (!byProfile[profile]) byProfile[profile] = 0
      byProfile[profile]++
    }
    let confirmadas = 0
    let canceladas = 0
    const events = $app.findRecordsByFilter('agenda_events', '', '-event_at', 5000, 0)
    for (const ev of events) {
      if (ev.getString('type') !== 'consulta') continue
      const st = ev.getString('status')
      if (st === 'confirmado') confirmadas++
      else if (st === 'cancelado') canceladas++
    }
    let filaAbertas = 0
    let filaSemResp = 0
    const items = $app.findRecordsByFilter('service_items', '', '-created', 5000, 0)
    for (const it of items) {
      const st = it.getString('status')
      if (st !== 'pendente' && st !== 'em_andamento') continue
      filaAbertas++
      if (!it.getString('assignee')) filaSemResp++
    }
    const mediaRows = $app.findRecordsByFilter('media_daily', '', '-day', 5000, 0)
    let spend = 0
    let hasMedia = false
    const byChannel = {}
    for (const row of mediaRows) {
      const d = new Date(String(row.getString('day')).replace(' ', 'T'))
      if (isNaN(d.getTime()) || d.getTime() < start.getTime() || d.getTime() > end.getTime())
        continue
      hasMedia = true
      spend += row.getInt('spend_cents', 0)
      const p = row.getString('platform')
      if (!byChannel[p]) byChannel[p] = 0
      byChannel[p] += row.getInt('spend_cents', 0)
    }

    const conv = pct(confirmadas, periodOps.length)

    const facts = []
    facts.push(
      'Período ' +
        fmtBR(start) +
        ' a ' +
        fmtBR(end) +
        ': ' +
        newContacts +
        ' pessoas novas e ' +
        periodOps.length +
        ' oportunidades novas (contagens separadas).',
    )
    facts.push(
      'Consultas: ' +
        confirmadas +
        ' confirmadas, ' +
        canceladas +
        ' canceladas (cancelada não conta). Conversão oportunidade → consulta confirmada: ' +
        conv +
        '.',
    )
    facts.push(
      'Qualificação: ' +
        qualCompleta +
        ' de ' +
        periodOps.length +
        ' oportunidades com avaliação completa.',
    )
    let profileLine = 'Perfis: '
    const pk = Object.keys(byProfile)
    for (let i = 0; i < pk.length; i++) {
      profileLine += pk[i] + ' ' + byProfile[pk[i]]
      if (i < pk.length - 1) profileLine += ' · '
    }
    facts.push(profileLine + '.')
    if (hasMedia) {
      facts.push('Investimento importado no período: ' + brl(spend) + '.')
      const parts = []
      const ck = Object.keys(byChannel)
      for (let i = 0; i < ck.length; i++) parts.push(ck[i] + ' ' + brl(byChannel[ck[i]]))
      facts.push('Por canal: ' + parts.join(' · ') + '.')
      if (periodOps.length > 0) {
        facts.push(
          'Custo por oportunidade: ' +
            brl(Math.round(spend / periodOps.length)) +
            ' (investimento ÷ ' +
            periodOps.length +
            ' oportunidades).',
        )
      } else {
        facts.push(
          'Custo por oportunidade: não calculável (divisor zero — sem oportunidade no período).',
        )
      }
    } else {
      facts.push(
        'Investimento: indisponível — nenhum dado de mídia importado no período. Ausência de dado não é gasto zero.',
      )
    }
    if (filaAbertas > 0) {
      facts.push(
        'Fila: ' + filaAbertas + ' item(ns) aberto(s), ' + filaSemResp + ' sem responsável.',
      )
    }

    const hypotheses = []
    if (periodOps.length > 0 && confirmadas === 0) {
      hypotheses.push(
        'HIPÓTESE (não é causa provada): oportunidades sem nenhuma consulta confirmada podem indicar gargalo no agendamento — conferir a fila e os tempos de resposta.',
      )
    }
    if (hasMedia && periodOps.length > 0 && spend > 0) {
      const cpo = spend / periodOps.length / 100
      if (cpo > 300) {
        hypotheses.push(
          'HIPÓTESE: custo por oportunidade (' +
            brl(Math.round(spend / periodOps.length)) +
            ') está alto — pode ser aprendizado da campanha ou atrito no formulário. Compare com o próximo período antes de mudar anúncio.',
        )
      }
    }
    if (qualCompleta < periodOps.length) {
      hypotheses.push(
        'HIPÓTESE: ' +
          (periodOps.length - qualCompleta) +
          ' oportunidade(s) sem avaliação completa — faltam dados lançados (modalidade/tipo de cuidado), o ranking de perfis fica parcial.',
      )
    }
    if (hypotheses.length === 0) {
      hypotheses.push('Sem anomalias evidentes nos agregados deste período.')
    }

    const next = []
    if (!hasMedia) next.push('Importar o CSV de investimento em Mídia para habilitar custos.')
    if (filaSemResp > 0)
      next.push('Distribuir os itens de fila sem responsável — alerta não substitui dono.')
    if (confirmadas === 0 && periodOps.length > 0)
      next.push(
        'Conferir oportunidades em "Agendamento solicitado" e confirmar consultas na Agenda.',
      )
    if (next.length === 0) {
      next.push(
        'Comparar o próximo período canal contra canal (não há meta definida — a comparação é entre canais, nunca contra meta inventada).',
      )
    }

    return e.json(200, {
      period: { from: start.toISOString(), to: end.toISOString() },
      question: question,
      facts: facts,
      hypotheses: hypotheses,
      next_steps: next,
      limitation:
        'Análise baseada apenas em números agregados do painel — sem acesso a conversas, fichas ou dados de pacientes. Não atribui causalidade a criativos nem altera mídia. Orçamento por canal e CPA alvo não definidos: não há comparação contra meta.',
      engine: 'deterministico-sobre-agregados-do-painel',
    })
  },
  $apis.requireAuth(),
)
