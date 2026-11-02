// AL-F3-01: rota de agregação do painel — a ÚNICA fonte dos números que o Dr. vê.
// O assistente (AL-F3-04) reutiliza esta rota, para nunca divergir do painel.
// Regras da SPEC: pessoas ≠ oportunidades; etapa atual é fotografia de hoje; cancelado não
// conta como agendamento; divisor zero = "não calculável"; mídia ausente = indisponível,
// nunca zero; sem ligação confiável de campanha, mostrar "sem atribuição" e não ratear.
routerAdd(
  'POST',
  '/backend/v1/painel/agregados',
  (e) => {
    const body = e.requestInfo().body || {}
    const from = String(body.from || '')
    const to = String(body.to || '')

    // período padrão: últimos 30 dias (inclusive hoje)
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
    const startIso = start.toISOString()
    const endIso = end.toISOString()

    const inPeriod = (raw) => {
      if (!raw) return false
      const d = new Date(String(raw).replace(' ', 'T'))
      if (isNaN(d.getTime())) return false
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime()
    }

    // ---------- 1. pessoas e oportunidades (SEPARADOS) ----------
    const contacts = $app.findRecordsByFilter('contacts', '', '', 5000, 0)
    const newContacts = contacts.filter((c) => inPeriod(c.getString('created'))).length

    const ops = $app.findRecordsByFilter('opportunities', '', '-created', 5000, 0)
    const periodOps = ops.filter((o) => inPeriod(o.getString('created')))

    // ---------- 2. etapas (fotografia de hoje, rotulada) ----------
    const stageCount = {}
    for (const o of periodOps) {
      const s = o.getString('stage')
      stageCount[s] = (stageCount[s] || 0) + 1
    }

    // ---------- 3. qualificação e perfil (última avaliação por oportunidade) ----------
    const quals = $app.findRecordsByFilter('qualifications', '', '-created', 5000, 0)
    const lastQualByOp = {}
    for (const q of quals) {
      const opId = q.getString('opportunity')
      if (!lastQualByOp[opId]) lastQualByOp[opId] = q // lista vem ordenada por -created
    }
    let qualCompleta = 0
    let qualIncompleta = 0
    const byProfile = {}
    const byModality = {}
    const byCare = {}
    for (const o of periodOps) {
      const q = lastQualByOp[o.id]
      if (q) {
        const st = q.getString('state')
        if (st === 'completa') qualCompleta++
        else if (st === 'incompleta') qualIncompleta++
        const profile = q.getString('best_profile_name') || 'sem perfil'
        if (!byProfile[profile]) byProfile[profile] = { oportunidades: 0, confirmadas: 0 }
        byProfile[profile].oportunidades++
      } else {
        if (!byProfile['sem perfil']) byProfile['sem perfil'] = { oportunidades: 0, confirmadas: 0 }
        byProfile['sem perfil'].oportunidades++
      }
      const mod = o.getString('modality') || 'não informado'
      if (!byModality[mod]) byModality[mod] = 0
      byModality[mod]++
      const care = o.getString('care_type') || 'não informado'
      if (!byCare[care]) byCare[care] = 0
      byCare[care]++
    }

    // ---------- 4. agendamentos e resultados (cancelado não conta) ----------
    let consultasSolicitadas = 0
    let consultasConfirmadas = 0
    let consultasCanceladas = 0
    let consultasRealizadas = 0
    let resultadosComerciais = 0
    const confirmedByOp = {}
    const events = $app.findRecordsByFilter('agenda_events', '', '-event_at', 5000, 0)
    for (const ev of events) {
      const opId = ev.getString('opportunity')
      const type = ev.getString('type')
      const status = ev.getString('status')
      if (type === 'consulta') {
        if (status === 'solicitado') consultasSolicitadas++
        else if (status === 'confirmado') {
          consultasConfirmadas++
          confirmedByOp[opId] = (confirmedByOp[opId] || 0) + 1
        } else if (status === 'cancelado') consultasCanceladas++
        else if (status === 'realizado') consultasRealizadas++
      } else if (type === 'resultado_comercial' && status === 'realizado') {
        resultadosComerciais++
      }
    }
    for (const o of periodOps) {
      const profile =
        (lastQualByOp[o.id] && lastQualByOp[o.id].getString('best_profile_name')) || 'sem perfil'
      if (byProfile[profile] && confirmedByOp[o.id]) {
        byProfile[profile].confirmadas += confirmedByOp[o.id]
      }
    }

    // ---------- 5. fila e tempos ----------
    let filaSemResponsavel = 0
    let filaVencidas = 0
    let filaAbertas = 0
    let respostaMediaMin = null
    let respostaCount = 0
    let acaoMediaMin = null
    let acaoCount = 0
    const items = $app.findRecordsByFilter('service_items', '', '-created', 5000, 0)
    const nowMs = Date.now()
    for (const it of items) {
      const st = it.getString('status')
      if (st !== 'pendente' && st !== 'em_andamento') continue
      filaAbertas++
      if (!it.getString('assignee')) filaSemResponsavel++
      const dl = it.getString('deadline_at')
      if (dl) {
        const d = new Date(String(dl).replace(' ', 'T'))
        if (!isNaN(d.getTime()) && d.getTime() < nowMs) filaVencidas++
      }
      // tempo de PRIMEIRA AÇÃO no CRM (não é resposta ao paciente)
      const created = it.getString('created')
      const firstAction = it.getString('first_action_at')
      if (created && firstAction) {
        const c = new Date(String(created).replace(' ', 'T'))
        const a = new Date(String(firstAction).replace(' ', 'T'))
        if (!isNaN(c.getTime()) && !isNaN(a.getTime()) && a.getTime() >= c.getTime()) {
          const mins = Math.round((a.getTime() - c.getTime()) / 60000)
          acaoMediaMin = acaoMediaMin === null ? mins : acaoMediaMin + mins
          acaoCount++
        }
      }
      // tempo de RESPOSTA DECLARADA (diferente de assumir)
      const resp = it.getString('first_human_response_at')
      if (created && resp) {
        const c = new Date(String(created).replace(' ', 'T'))
        const r = new Date(String(resp).replace(' ', 'T'))
        if (!isNaN(c.getTime()) && !isNaN(r.getTime()) && r.getTime() >= c.getTime()) {
          const mins = Math.round((r.getTime() - c.getTime()) / 60000)
          respostaMediaMin = respostaMediaMin === null ? mins : respostaMediaMin + mins
          respostaCount++
        }
      }
    }

    // ---------- 6. mídia e custos (ausente = indisponível, nunca zero) ----------
    const mediaRows = $app.findRecordsByFilter('media_daily', '', '-day', 5000, 0)
    const inMediaPeriod = (row) => {
      // PocketBase grava a data como "AAAA-MM-DD 00:00:00.000Z"; normaliza antes de comparar
      const raw = String(row.getString('day') || '')
        .replace(' ', 'T')
        .trim()
      if (!raw) return false
      const d = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
      if (isNaN(d.getTime())) return false
      const t = d.getTime()
      return t >= start.getTime() && t <= end.getTime()
    }
    const byChannel = {}
    const currencies = {}
    let spendTotalCents = 0
    let hasMedia = false
    for (const row of mediaRows) {
      if (!inMediaPeriod(row)) continue
      hasMedia = true
      const p = row.getString('platform')
      const cur = row.getString('currency')
      currencies[cur] = (currencies[cur] || 0) + 1
      if (!byChannel[p]) {
        byChannel[p] = {
          spend_cents: 0,
          impressions: 0,
          clicks: 0,
          platform_leads: 0,
          campaigns: 0,
        }
      }
      byChannel[p].spend_cents += row.getInt('spend_cents', 0)
      spendTotalCents += row.getInt('spend_cents', 0)
      byChannel[p].impressions += row.getInt('impressions', 0)
      byChannel[p].clicks += row.getInt('clicks', 0)
      byChannel[p].platform_leads += row.getInt('platform_leads', 0)
      byChannel[p].campaigns++
    }
    const multiCurrency = Object.keys(currencies).length > 1

    // metas por canal (vazias = não definidas)
    const targets = {}
    try {
      for (const t of $app.findRecordsByFilter('channel_targets', '', '', 50, 0)) {
        const b = t.getInt('monthly_budget_cents', 0)
        targets[t.getString('platform')] = b > 0 ? b : null
      }
    } catch (_) {}

    // custo por oportunidade e por agendamento — SÓ com mídia no período
    const custoPorOportunidade =
      hasMedia && periodOps.length > 0
        ? { value_cents: Math.round(spendTotalCents / periodOps.length), divisor: periodOps.length }
        : {
            value_cents: null,
            divisor: periodOps.length,
            motivo:
              periodOps.length === 0
                ? 'sem oportunidades no período'
                : 'sem investimento importado no período',
          }
    const totalConfirmadas = Object.keys(confirmedByOp).length
    const custoPorAgendamento =
      hasMedia && totalConfirmadas > 0
        ? { value_cents: Math.round(spendTotalCents / totalConfirmadas), divisor: totalConfirmadas }
        : {
            value_cents: null,
            divisor: totalConfirmadas,
            motivo:
              totalConfirmadas === 0
                ? 'sem agendamentos confirmados no período'
                : 'sem investimento importado no período',
          }

    // ---------- 7. tempos do canal WhatsApp (RN-25, AL-F4-04) ----------
    // Linhas SEPARADAS: resposta humana real, resposta automática, ação no CRM e declarada.
    // Sem dado real no período → "indisponível", nunca zero.
    let realMin = null
    let realCount = 0
    let realDeclared = 0
    const realBuckets = { ate_30min: 0, ate_1h: 0, acima_1h: 0 }
    let autoCount = 0
    let esperasAbertas = 0
    let coberturaM = 0
    const waItens = []
    try {
      for (const it of items) {
        const isWa = it.getString('channel') === 'whatsapp'
        const waitStart = it.getString('wait_started_at')
        const replyAt = it.getString('first_human_reply_at')
        const declAt = it.getString('first_human_response_at')

        // cobertura: M = esperas do período que já tiveram resposta real ou declarada
        if (waitStart && inPeriod(waitStart)) {
          if (replyAt || declAt) coberturaM++
          if (replyAt) {
            realCount++
            if (it.getString('first_human_reply_source') === 'celular_declarado') realDeclared++
            const a = new Date(String(waitStart).replace(' ', 'T'))
            const b = new Date(String(replyAt).replace(' ', 'T'))
            if (!isNaN(a.getTime()) && !isNaN(b.getTime()) && b.getTime() >= a.getTime()) {
              const mins = Math.round((b.getTime() - a.getTime()) / 60000)
              realMin = realMin === null ? mins : realMin + mins
              if (mins <= 30) realBuckets.ate_30min++
              else if (mins <= 60) realBuckets.ate_1h++
              else realBuckets.acima_1h++
            }
          } else if (!declAt) {
            esperasAbertas++
          }
        }
        // acolhimentos aceitos no período
        if (
          isWa &&
          it.getString('first_auto_reply_at') &&
          inPeriod(it.getString('first_auto_reply_at'))
        ) {
          autoCount++
        }
      }
      // acolhimentos contados pela fila de saída (mais preciso que o item)
      const outs = $app.findRecordsByFilter(
        'outbound_messages',
        "kind = 'acolhimento' && state = 'aceita'",
        '',
        500,
        0,
      )
      autoCount = 0
      for (const o of outs) {
        const when = o.getString('created')
        if (inPeriod(when) || inPeriod(o.getString('updated'))) autoCount++
      }
    } catch (_) {}

    const canalDisponivel = realCount > 0 || coberturaM > 0 || esperasAbertas > 0

    // ---------- resposta ----------
    const avg = (sum, n) => (n > 0 ? Math.round(sum / n) : null)
    return e.json(200, {
      period: { from: startIso, to: endIso },
      generated_at: now.toISOString(),
      definitions: {
        pessoas: 'Contatos criados no período (uma pessoa pode ter várias oportunidades).',
        oportunidades: 'Jornadas abertas no período (ID próprio, diferente de pessoa).',
        etapas:
          'Etapa ATUAL das oportunidades criadas no período — fotografia de hoje, não reconstrução histórica.',
        consultas: 'Eventos de consulta por status; cancelado não conta como agendamento.',
        custo_por_oportunidade:
          'Investimento importado no período ÷ oportunidades criadas no período. Sem atribuição por campanha (não há identificador técnico ligando lead a anúncio).',
        custo_por_agendamento:
          'Investimento importado no período ÷ oportunidades da coorte com ≥1 consulta confirmada até a data de corte.',
        tempos:
          'Ação no CRM ≠ resposta declarada ao paciente. WhatsApp permanece indisponível antes da fase 4.',
      },
      crm: {
        new_contacts: newContacts,
        new_opportunities: periodOps.length,
        total_opportunities_all_time: ops.length,
        stages: stageCount,
        qualification: {
          completa: qualCompleta,
          incompleta: qualIncompleta,
          sem_avaliacao: periodOps.length - qualCompleta - qualIncompleta,
        },
        by_profile: byProfile,
        by_modality: byModality,
        by_care_type: byCare,
      },
      agenda: {
        consultas: {
          solicitadas: consultasSolicitadas,
          confirmadas: consultasConfirmadas,
          canceladas: consultasCanceladas,
          realizadas: consultasRealizadas,
        },
        resultados_comerciais: resultadosComerciais,
      },
      fila: {
        abertas: filaAbertas,
        sem_responsavel: filaSemResponsavel,
        acao_vencida: filaVencidas,
        tempo_primeira_acao_min: avg(acaoMediaMin || 0, acaoCount),
        tempo_resposta_declarada_min: avg(respostaMediaMin || 0, respostaCount),
      },
      whatsapp_times: {
        disponivel: canalDisponivel,
        primeira_resposta_real_min: realCount > 0 ? Math.round((realMin || 0) / realCount) : null,
        amostra_real: realCount,
        faixas: realBuckets,
        com_autoria_declarada: realDeclared,
        primeira_resposta_automatica: autoCount,
        esperas_abertas: esperasAbertas,
        cobertura_m: coberturaM,
        cobertura_texto:
          coberturaM > 0 ? realCount + ' de ' + coberturaM : 'sem esperas no período',
        definicao:
          'Primeira resposta humana real (canal): minutos entre a espera do WhatsApp e a primeira resposta humana, excluindo acolhimento automático e a Clara. Ação no CRM e resposta declarada continuam em linhas próprias.',
      },
      media: {
        has_data: hasMedia,
        multi_currency: multiCurrency,
        currencies: currencies,
        total_spend_cents: spendTotalCents,
        by_channel: byChannel,
        targets: targets,
        custo_por_oportunidade: custoPorOportunidade,
        custo_por_agendamento: custoPorAgendamento,
        sem_atribuicao_de_campanha: periodOps.length,
        limitacao:
          'Não há identificador técnico ligando lead a campanha: o gasto não é rateado por adivinhação.',
      },
    })
  },
  $apis.requireAuth(),
)
