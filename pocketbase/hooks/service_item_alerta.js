// AL-F2-03 revisado — pedido do Dr. Ernesto (28/10, 16:50): réguas de alerta EDITÁVEIS.
// Antes o prazo era fixo no código. Agora o cron lê a coleção `alert_rules`: cada régua diz
// quando disparar, para qual perfil de paciente, com que prioridade e qual a ação esperada.
// O Dr. cria, edita, ativa/desativa e remove réguas pela tela — o motor não muda.
// Regras mantidas da SPEC: alerta só dentro do horário de funcionamento; deduplicado por
// item + régua enquanto não reconhecido; nada é enviado ao paciente (alerta é interno).
cronAdd('fila_alertas_atraso', '* * * * *', () => {
  // PocketBase JSVM: cada callback roda em VM separada — todo helper mora DENTRO do callback.
  const SP_OFFSET_MIN = -180 // America/Sao_Paulo = UTC-3
  const toMinutes = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const parseDate = (raw) => {
    if (!raw) return null
    const d = new Date(String(raw).replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d
  }
  // 1. horário de funcionamento (editável pelo CEO em Configuração)
  let startMin = null
  let endMin = null
  let recipient = ''
  try {
    const s = $app.findFirstRecordByFilter('clinic_settings', "settings_key = 'main'")
    startMin = toMinutes(s.getString('business_hours_start'))
    endMin = toMinutes(s.getString('business_hours_end'))
    recipient = s.getString('alert_recipient')
  } catch (_) {}
  if (startMin === null || endMin === null) {
    console.log('alertas: horario de funcionamento nao configurado')
    return
  }

  const now = new Date()
  const spMinutes =
    (((now.getUTCHours() * 60 + now.getUTCMinutes() + SP_OFFSET_MIN) % 1440) + 1440) % 1440
  if (spMinutes < startMin || spMinutes >= endMin) {
    console.log('alertas: fora do horario sp=' + spMinutes + ' janela=' + startMin + '-' + endMin)
    return
  }

  // 2. réguas ativas
  let rules = []
  try {
    rules = $app.findRecordsByFilter('alert_rules', 'active = true', '-priority', 200, 0)
  } catch (_) {
    return
  }
  if (!rules || rules.length === 0) {
    console.log('alertas: nenhuma régua ativa')
    return
  }

  const alertedKeys = {}
  const alreadyAlerted = (key) => {
    if (alertedKeys[key]) return true
    const open = $app.findRecordsByFilter(
      'internal_alerts',
      'dedupe_key = {:k} && acknowledged_at = ""',
      '',
      1,
      0,
      { k: key },
    )
    if (open.length > 0) {
      alertedKeys[key] = true
      return true
    }
    return false
  }

  const makeAlert = (op, item, rule, message, dueAt) => {
    const key = (item ? item.id : op.id) + '|' + rule.id
    if (alreadyAlerted(key)) return
    const alert = new Record($app.findCollectionByNameOrId('internal_alerts'))
    if (item) alert.set('item', item.id)
    alert.set('violation', rule.getString('kind'))
    alert.set('dedupe_key', key)
    alert.set('message', message)
    alert.set('rule', rule.id)
    if (dueAt) alert.set('due_at', dueAt.toISOString())
    if (recipient) alert.set('recipient', recipient)
    $app.save(alert)
    alertedKeys[key] = true
  }

  // Perfil do paciente = modalidade + tipo de cuidado. As réguas do Dr. distinguem
  // cirúrgico de clínico e particular de convênio; sem care_type o perfil não é julgado.
  const profileOf = (op) => {
    const mod = op.getString('modality')
    const care = op.getString('care_type')
    if (mod === 'convenio') return care === 'clinico' ? 'clinico_porto' : 'convenio'
    if (mod === 'reembolso') return 'reembolso'
    if (mod === 'particular') return care === 'clinico' ? 'clinico_particular' : 'particular'
    return ''
  }
  const ruleCoversProfile = (rule, profile) => {
    const target = rule.getString('applies_to')
    if (!target || target === 'todos') return true
    if (!profile) return false // perfil desconhecido: nenhuma régua específica se aplica
    return target === profile
  }

  const opportunities = $app.findRecordsByFilter('opportunities', '', '-updated', 500, 0)
  const openItems = $app.findRecordsByFilter(
    'service_items',
    "status = 'pendente' || status = 'em_andamento'",
    '',
    500,
    0,
  )
  const itemsByOp = {}
  for (const it of openItems) {
    const o = it.getString('opportunity')
    if (!itemsByOp[o]) itemsByOp[o] = []
    itemsByOp[o].push(it)
  }

  for (const rule of rules) {
    const kind = rule.getString('kind')
    const threshold = rule.getInt('threshold_minutes', 0)
    if (!threshold || threshold <= 0) continue
    const thresholdMs = threshold * 60000
    const hint = rule.getString('action_hint')
    const ruleName = rule.getString('name')

    for (const op of opportunities) {
      if (op.getString('status') === 'encerrada') continue
      const profile = profileOf(op)
      if (!ruleCoversProfile(rule, profile)) continue

      if (kind === 'sem_interacao') {
        console.log('alertas: avaliando ' + ruleName + ' para ' + op.id + ' perfil=' + profile)
        // último contato/atividade da oportunidade sem resposta declarada
        const items = itemsByOp[op.id] || []
        let reference = null
        let referenceItem = null
        for (const it of items) {
          if (it.getString('first_human_response_at')) continue // já respondido
          const last =
            parseDate(it.getString('last_activity_at')) || parseDate(it.getString('created'))
          if (!last) continue
          if (!reference || last.getTime() > reference.getTime()) {
            reference = last
            referenceItem = it
          }
        }
        if (!reference) {
          // sem item de fila: usa a criação da oportunidade. `created` pode vir vazio em
          // registros antigos (defeito 28/10) — cai para `updated`, que sempre existe.
          reference = parseDate(op.getString('created')) || parseDate(op.getString('updated'))
          referenceItem = null
        }
        if (!reference) continue
        const due = new Date(reference.getTime() + thresholdMs)
        if (due.getTime() > now.getTime()) continue
        const nome = op.getString('interest') || 'paciente'
        makeAlert(
          op,
          referenceItem,
          rule,
          `${ruleName}: ${nome} sem interação nossa há ${threshold} min. ${hint}`,
          due,
        )
      } else if (kind === 'antes_consulta') {
        // consulta marcada (status solicitado ou confirmado) cuja hora está a X do agora
        let events = []
        try {
          events = $app.findRecordsByFilter(
            'agenda_events',
            "opportunity = {:o} && type = 'consulta' && (status = 'solicitado' || status = 'confirmado')",
            'event_at',
            20,
            0,
            { o: op.id },
          )
        } catch (_) {}
        for (const ev of events) {
          const when = parseDate(ev.getString('event_at'))
          if (!when) continue
          const diff = when.getTime() - now.getTime()
          if (diff <= 0) continue // já passou
          // dispara quando entra na janela de antecedência
          if (diff > thresholdMs) continue
          makeAlert(
            op,
            null,
            rule,
            `${ruleName}: consulta de ${op.getString('interest') || 'paciente'} em ${Math.round(diff / 3600000)}h. ${hint}`,
            when,
          )
        }
      } else if (kind === 'pos_atendimento') {
        // atendimento realizado e nenhum contato nosso depois dele
        let events = []
        try {
          events = $app.findRecordsByFilter(
            'agenda_events',
            "opportunity = {:o} && status = 'realizado'",
            '-event_at',
            5,
            0,
            { o: op.id },
          )
        } catch (_) {}
        if (events.length === 0) continue
        const done = parseDate(events[0].getString('event_at'))
        if (!done) continue
        if (done.getTime() + thresholdMs > now.getTime()) continue
        const lastContact = parseDate(op.getString('updated'))
        if (lastContact && lastContact.getTime() > done.getTime()) continue // já houve interação
        makeAlert(
          op,
          null,
          rule,
          `${ruleName}: ${op.getString('interest') || 'paciente'} atendido — contatar para feedback. ${hint}`,
          new Date(done.getTime() + thresholdMs),
        )
      } else if (kind === 'retorno') {
        // tempo desde a última passagem na clínica (última atualização ou último evento)
        let reference = parseDate(op.getString('updated'))
        try {
          const evs = $app.findRecordsByFilter(
            'agenda_events',
            'opportunity = {:o}',
            '-event_at',
            1,
            0,
            { o: op.id },
          )
          if (evs.length > 0) {
            const last = parseDate(evs[0].getString('event_at'))
            if (last && (!reference || last.getTime() > reference.getTime())) reference = last
          }
        } catch (_) {}
        if (!reference) continue
        if (reference.getTime() + thresholdMs > now.getTime()) continue
        makeAlert(
          op,
          null,
          rule,
          `${ruleName}: ${op.getString('interest') || 'paciente'} sem passar na clínica há ${Math.round(threshold / 1440)} dias. ${hint}`,
          new Date(reference.getTime() + thresholdMs),
        )
      }
    }
  }
})
