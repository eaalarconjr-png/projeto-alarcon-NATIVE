// task AL-F2-03: alertas internos de item atrasado — cron a cada 5 minutos.
// Regras da SPEC: alerta só dentro do horário de funcionamento configurado (fora dele o
// prazo retoma na próxima abertura); deduplicado por item e violação; sem prazo ou sem
// horário configurado, nada dispara; SLA em minutos úteis quando configurado. Alerta é
// interno ao aplicativo — nada é enviado ao WhatsApp nesta fase.
cronAdd('fila_alertas_atraso', '*/5 * * * *', () => {
  // 1. configuração da clínica (horário America/Sao_Paulo = UTC-3)
  let start = ''
  let end = ''
  let sla = 0
  let recipient = ''
  try {
    const s = $app.findFirstRecordByFilter('clinic_settings', "settings_key = 'main'")
    start = s.getString('business_hours_start')
    end = s.getString('business_hours_end')
    sla = s.getInt('sla_minutes', 0)
    recipient = s.getString('alert_recipient')
  } catch (_) {}
  if (!start || !end) {
    return // horário não configurado: nenhum alerta (SPEC — informar não configurado)
  }

  const now = new Date()
  const spMinutes = ((now.getUTCHours() - 3 + 24) % 24) * 60 + now.getUTCMinutes()
  const toMin = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const startMin = toMin(start)
  const endMin = toMin(end)
  if (startMin === null || endMin === null || spMinutes < startMin || spMinutes >= endMin) {
    return // fora do horário: prazo retoma na próxima abertura
  }

  // 2. itens abertos com prazo vencido (ou SLA configurado quando não há prazo manual)
  const items = $app.findRecordsByFilter(
    'service_items',
    "status = 'pendente' || status = 'em_andamento'",
    '',
    200,
    0,
  )
  for (const item of items) {
    let deadlineMs = 0
    const rawDeadline = item.getString('deadline_at')
    if (rawDeadline) {
      const parsed = new Date(rawDeadline.replace(' ', 'T'))
      if (isNaN(parsed.getTime())) continue
      deadlineMs = parsed.getTime()
    } else if (sla > 0) {
      const rawCreated = item.getString('created')
      const parsedCreated = new Date(rawCreated.replace(' ', 'T'))
      if (isNaN(parsedCreated.getTime())) continue
      deadlineMs = parsedCreated.getTime() + sla * 60000
    } else {
      continue // sem prazo e sem SLA: não configurado para este item
    }
    if (deadlineMs > now.getTime()) continue // ainda dentro do prazo

    // 3. deduplicação: um alerta não reconhecido por item e violação
    const open = $app.findRecordsByFilter(
      'internal_alerts',
      'item = {:i} && violation = {:v} && acknowledged_at = ""',
      '',
      1,
      0,
      { i: item.id, v: 'atrasado' },
    )
    if (open.length > 0) continue

    const alert = new Record($app.findCollectionByNameOrId('internal_alerts'))
    alert.set('item', item.id)
    alert.set('violation', 'atrasado')
    alert.set(
      'message',
      'Item atrasado: "' + item.getString('title') + '" passou do prazo de atendimento.',
    )
    if (recipient) {
      alert.set('recipient', recipient)
    }
    $app.save(alert)
  }
})
