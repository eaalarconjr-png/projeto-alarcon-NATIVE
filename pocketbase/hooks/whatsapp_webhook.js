// AL-F4-02: webhook da D-API — recebe as mensagens do WhatsApp e coloca no CRM.
// Contrato e regras: SPEC AL-F4-A, RN-01 a RN-13, RN-18, RN-19, RN-20 (CA-4-01/02/03/06).
//
// Princípios que este arquivo respeita:
// - NUNCA responde 5xx por dado de negócio: erro de vínculo vira conversa `revisar`, não perda.
// - A mesma entrega repetida não duplica mensagem, conversa, contato nem item (RN-03).
// - A autenticação é token no caminho + User-Agent + sessionId (a D-API não assina HMAC).
// - NENHUMA mensagem é enviada a paciente por este arquivo: ele só grava o que chega.
// - Grupo, status e reação não viram mensagem (RN-05).
// POCKETBASE JSVM: cada callback roda em VM própria — todo helper mora DENTRO do callback.

// ======================= WEBHOOK =======================
routerAdd('POST', '/backend/v1/whatsapp/dapi/{token}', (e) => {
  // ---------- helpers (dentro do callback: exigência do JSVM) ----------
  const token = String(e.request.pathValue('token') || '')
  const ua = String(e.request.header.get('User-Agent') || '')

  // comparação em tempo constante (evita descobrir o token por tempo de resposta)
  const safeEqual = (a, b) => {
    const x = String(a || '')
    const y = String(b || '')
    if (x.length !== y.length) return false
    let diff = 0
    for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
    return diff === 0
  }
  const secret = (k) => {
    try {
      return String($secrets.get(k) || '')
    } catch (_) {
      return ''
    }
  }
  const receipt = (dedupeKey, event, sessionId, refId, result, httpStatus, errorCode) => {
    try {
      // recibos recusados usam chave própria, fora da deduplicação de RN-03
      const exists = $app.findRecordsByFilter(
        'provider_event_receipts',
        'dedupe_key = {:k}',
        '',
        1,
        0,
        { k: dedupeKey },
      )
      if (exists.length > 0) return
      const r = new Record($app.findCollectionByNameOrId('provider_event_receipts'))
      r.set('dedupe_key', dedupeKey)
      r.set('event', String(event || '').slice(0, 60))
      r.set('session_id', String(sessionId || '').slice(0, 120))
      r.set('ref_id', String(refId || '').slice(0, 200))
      r.set('result', result)
      r.set('http_status', httpStatus)
      r.set('error_code', String(errorCode || '').slice(0, 80))
      r.set('received_at', new Date().toISOString())
      $app.save(r)
    } catch (_) {}
  }

  // ---------- RN-01: autenticação ----------
  const current = secret('DAPI_WEBHOOK_TOKEN')
  if (!current) {
    // sem token configurado o canal está indisponível (não é erro do chamador)
    return e.json(503, { ok: false, error: 'canal_indisponivel' })
  }
  let tokenOk = safeEqual(token, current)
  if (!tokenOk) {
    // token anterior é aceito por 1 hora depois da troca
    const previous = secret('DAPI_WEBHOOK_TOKEN_ANTERIOR')
    if (previous && safeEqual(token, previous)) {
      try {
        const conns = $app.findRecordsByFilter(
          'channel_connections',
          'token_rotated_at != ""',
          '',
          1,
          0,
        )
        if (conns.length > 0) {
          const rotated = new Date(String(conns[0].getString('token_rotated_at')).replace(' ', 'T'))
          const age = Date.now() - rotated.getTime()
          if (!isNaN(rotated.getTime()) && age >= 0 && age <= 3600000) tokenOk = true
        }
      } catch (_) {}
    }
  }
  if (!tokenOk) {
    // 404 sem recibo: não confirma a existência da rota
    return e.notFoundError()
  }
  if (ua.indexOf('Deliverify-Webhook/') !== 0) {
    receipt('recusado|ua|' + Date.now(), 'unknown', '', '', 'recusado', 403, 'user_agent')
    return e.json(403, { ok: false, error: 'user_agent_invalido' })
  }

  // ---------- RN-02: corpo ----------
  const body = e.requestInfo().body || {}
  const event = String(body.event || '')
  const sessionId = String(body.sessionId || '')
  const data = body.data
  if (!event || !sessionId || !data) {
    receipt('recusado|corpo|' + Date.now(), event, sessionId, '', 'recusado', 400, 'corpo_invalido')
    return e.json(400, { ok: false, error: 'corpo_invalido' })
  }

  // ---------- RN-03: deduplicação por evento ----------
  const refId = String(data.id || data.message_id || '')
  const dedupeKey = sessionId + '|' + event + '|' + refId
  const already = $app.findRecordsByFilter(
    'provider_event_receipts',
    'dedupe_key = {:k}',
    '',
    1,
    0,
    {
      k: dedupeKey,
    },
  )
  if (already.length > 0) return e.json(200, { ok: true, result: 'duplicado' })

  // ---------- RN-04: sessão ----------
  const allConns = $app.findRecordsByFilter('channel_connections', '', '-created', 50, 0)
  let conn = null
  let sessionResult = ''
  for (const c of allConns) {
    if (c.getString('session_id') === sessionId) {
      conn = c
      break
    }
  }
  if (conn) {
    if (!conn.getBool('active')) {
      receipt(dedupeKey, event, sessionId, refId, 'sessao_inativa', 200, '')
      return e.json(200, { ok: true, result: 'sessao_inativa' })
    }
  } else {
    // desconhecida: se existe exatamente UMA conexão real ativa sem session_id, vincula (RN-04)
    const candidates = []
    for (const c of allConns) {
      if (c.getBool('active') && !c.getBool('is_fixture') && !c.getString('session_id')) {
        candidates.push(c)
      }
    }
    if (candidates.length === 1) {
      conn = candidates[0]
      conn.set('session_id', sessionId)
      $app.save(conn)
      sessionResult = 'sessao_vinculada'
    } else {
      receipt(dedupeKey, event, sessionId, refId, 'sessao_desconhecida', 200, '')
      return e.json(200, { ok: true, result: 'sessao_desconhecida' })
    }
  }

  // sessão fixture exige o cabeçalho de prova (RN-04, exceção)
  if (conn.getBool('is_fixture')) {
    const expected = secret('FIXTURE_SECRET')
    const got = String(e.request.header.get('X-Fixture-Secret') || '')
    if (!expected || !safeEqual(got, expected)) {
      receipt(dedupeKey, event, sessionId, refId, 'recusado', 403, 'fixture_secret')
      return e.json(403, { ok: false, error: 'fixture_secret' })
    }
  }

  // marca o último evento aceito (RN-19)
  try {
    conn.set('last_event_at', new Date().toISOString())
    if (conn.getString('status') === 'desconectado') conn.set('status', 'conectado')
    $app.save(conn)
  } catch (_) {}

  // ---------- eventos que NÃO viram mensagem (RN-05) ----------
  const isMessageEvent =
    event === 'messages.received' || event === 'messages.sent' || event === 'history.messages.sent'
  if (
    !isMessageEvent &&
    event !== 'message.delivered' &&
    event !== 'message.read' &&
    event !== 'message.deleted' &&
    event !== 'connection.status'
  ) {
    receipt(dedupeKey, event, sessionId, refId, 'ignorado_tipo', 200, '')
    return e.json(200, { ok: true, result: 'ignorado_tipo' })
  }

  // ---------- connection.status ----------
  if (event === 'connection.status') {
    const st = String(data.status || data.state || '').toLowerCase()
    try {
      conn.set('last_status_raw', JSON.stringify(data).slice(0, 19000))
      if (st.indexOf('connect') >= 0 || st === 'open' || st === 'online')
        conn.set('status', 'conectado')
      else if (st.indexOf('disconnect') >= 0 || st === 'close' || st === 'offline')
        conn.set('status', 'desconectado')
      $app.save(conn)
    } catch (_) {}
    receipt(dedupeKey, event, sessionId, refId, 'atualizada', 200, '')
    return e.json(200, { ok: true, result: 'atualizada' })
  }

  // ---------- status de mensagem (delivered/read/deleted) ----------
  if (event === 'message.delivered' || event === 'message.read' || event === 'message.deleted') {
    const target = String(data.message_id || '').toLowerCase()
    const found = $app.findRecordsByFilter(
      'messages',
      'connection = {:c} && wa_message_id = {:m}',
      '',
      1,
      0,
      {
        c: conn.id,
        m: target,
      },
    )
    if (found.length === 0) {
      receipt(dedupeKey, event, sessionId, refId, 'status_pendente', 200, '')
      return e.json(200, { ok: true, result: 'status_pendente' })
    }
    const msg = found[0]
    if (event === 'message.deleted') {
      msg.set('deleted', true)
      msg.set('text', '')
      msg.set('media_meta', '')
      msg.set('media_url', '')
    } else {
      // RN-12: status só avança (aceita → entregue → lida)
      const order = { aceita: 1, entregue: 2, lida: 3 }
      const nextStatus = event === 'message.read' ? 'lida' : 'entregue'
      const cur = msg.getString('status')
      if ((order[nextStatus] || 0) > (order[cur] || 0)) {
        msg.set('status', nextStatus)
        msg.set('status_at', new Date(Number(data.timestamp) || Date.now()).toISOString())
      }
    }
    $app.save(msg)
    receipt(dedupeKey, event, sessionId, refId, 'atualizada', 200, '')
    return e.json(200, { ok: true, result: 'atualizada' })
  }

  // ---------- mensagens ----------
  if (data.is_group === true) {
    receipt(dedupeKey, event, sessionId, refId, 'ignorado_grupo', 200, '')
    return e.json(200, { ok: true, result: 'ignorado_grupo' })
  }
  if (String(data.type || '') === 'reaction') {
    receipt(dedupeKey, event, sessionId, refId, 'ignorado_tipo', 200, '')
    return e.json(200, { ok: true, result: 'ignorado_tipo' })
  }

  const fromMe = data.fromMe === true
  // RN-06: contato = from (entrada) ou to (saída)
  const party = fromMe ? data.to || {} : data.from || {}
  const jid = String(party.jid || '')
  const digitsOnly = (s) => String(s || '').replace(/\D/g, '')
  let phone = digitsOnly(String(jid).split('@')[0])
  const isLid = jid.indexOf('@lid') >= 0

  // RN-07: variantes do celular brasileiro (com/sem nono dígito, com/sem 55)
  const phoneVariants = (p) => {
    const out = [p]
    if (!p) return out
    if (p.indexOf('55') === 0 && p.length > 11) out.push(p.slice(2))
    const local = p.indexOf('55') === 0 ? p.slice(2) : p
    if (local.length === 11) out.push(local.slice(0, 2) + local.slice(3)) // sem o nono
    if (local.length === 10) out.push(local.slice(0, 2) + '9' + local.slice(2)) // com o nono
    for (const v of out.slice()) out.push('55' + v)
    return out.filter((v, i) => v && out.indexOf(v) === i)
  }

  const waMessageId = String(data.id || '').toLowerCase()
  if (!waMessageId) {
    receipt(dedupeKey, event, sessionId, refId, 'recusado', 400, 'sem_id')
    return e.json(400, { ok: false, error: 'sem_id' })
  }

  // ---------- conversa ----------
  let conv = null
  if (phone) {
    const byPhone = $app.findRecordsByFilter(
      'conversations',
      'connection = {:c} && contact_phone = {:p}',
      '',
      1,
      0,
      {
        c: conn.id,
        p: phone,
      },
    )
    if (byPhone.length > 0) conv = byPhone[0]
  } else if (isLid) {
    const byLid = $app.findRecordsByFilter(
      'conversations',
      'connection = {:c} && contact_lid = {:l}',
      '',
      1,
      0,
      {
        c: conn.id,
        l: String(jid).slice(0, 80),
      },
    )
    if (byLid.length > 0) conv = byLid[0]
  }

  const isHistory = event === 'history.messages.sent' || data.from_history === true

  if (!conv) {
    conv = new Record($app.findCollectionByNameOrId('conversations'))
    conv.set('connection', conn.id)
    conv.set('contact_phone', phone || '')
    conv.set('contact_lid', phone ? '' : String(jid).slice(0, 80))
    conv.set('contact_name_wa', String(party.name || '').slice(0, 160))
    conv.set('is_fixture', conn.getBool('is_fixture'))
    // vínculo inicial: histórico sem contato conhecido não cria ficha (RN-18)
    conv.set('link_state', isHistory ? 'historico_sem_contato' : 'sem_telefone')
    $app.save(conv)
  }

  // ---------- vínculo com contato/oportunidade (RN-06 a RN-10) ----------
  let contact = null
  if (phone) {
    const variants = phoneVariants(phone)
    let found = []
    for (const v of variants) {
      const r = $app.findRecordsByFilter('contacts', 'phone = {:p}', '', 3, 0, { p: v })
      if (r.length > 0) {
        found = r
        break
      }
    }
    if (found.length === 1) {
      contact = found[0]
    } else if (found.length > 1) {
      // telefone compartilhado: nada novo, vai para revisão (RN-09)
      conv.set('link_state', 'revisar')
      $app.save(conv)
    } else if (!isHistory && !fromMe) {
      // RN-09: mensagem nova de número desconhecido → cria ficha
      try {
        const novo = new Record($app.findCollectionByNameOrId('contacts'))
        const name = String(party.name || '').trim() || 'Contato WhatsApp ' + phone.slice(-4)
        novo.set('name', name.slice(0, 120))
        novo.set('phone', phone)
        novo.set('source_declared', 'whatsapp')
        $app.save(novo)
        contact = novo
      } catch (_) {}
    }
  }

  // RN-27: conversa marcada como "Não é paciente" NÃO volta a ser vinculada por mensagem nova.
  // O estado só muda quando uma pessoa usa "Voltar a paciente".
  const markedNotPatient = conv.getString('link_state') === 'nao_paciente'

  if (contact && !markedNotPatient) {
    conv.set('contact', contact.id)
    // RN-08: exatamente UMA oportunidade aberta → liga; zero ou várias → revisar
    let openOpps = []
    try {
      openOpps = $app.findRecordsByFilter(
        'opportunities',
        'contact = {:c} && status = "aberta"',
        '-created',
        5,
        0,
        { c: contact.id },
      )
    } catch (_) {}
    if (openOpps.length === 1) {
      conv.set('opportunity', openOpps[0].id)
      conv.set('link_state', 'vinculada')
      // RN-08b: se a oportunidade ligada estava encerrada, reaplica (já coberto por status=aberta)
    } else {
      conv.set('link_state', 'revisar')
      // RN-09: sem oportunidade aberta e mensagem nova do paciente → cria oportunidade
      if (openOpps.length === 0 && !isHistory && !fromMe) {
        let ownerId = conn.getString('default_owner')
        if (!ownerId) {
          const admins = $app.findRecordsByFilter('users', "role = 'admin'", '', 1, 0)
          if (admins.length > 0) ownerId = admins[0].id
        }
        if (ownerId) {
          try {
            const op = new Record($app.findCollectionByNameOrId('opportunities'))
            op.set('contact', contact.id)
            op.set('interest', 'Não informado')
            op.set('modality', 'particular')
            op.set('care_type', '')
            op.set('owner', ownerId)
            op.set('stage', 'novo')
            op.set('status', 'aberta')
            op.set('origin_captured', 'whatsapp')
            $app.save(op)
            conv.set('opportunity', op.id)
            conv.set('link_state', 'vinculada')
          } catch (_) {}
        }
      }
    }
    if (!phone) conv.set('link_state', 'sem_telefone')
  }

  // ---------- grava a mensagem (UNIQUE connection + wa_message_id) ----------
  const existingMsg = $app.findRecordsByFilter(
    'messages',
    'connection = {:c} && wa_message_id = {:m}',
    '',
    1,
    0,
    {
      c: conn.id,
      m: waMessageId,
    },
  )
  if (existingMsg.length > 0) {
    receipt(dedupeKey, event, sessionId, refId, 'duplicado', 200, '')
    return e.json(200, { ok: true, result: 'duplicado' })
  }

  // RN-11: quem mandou
  let authorKind = 'paciente'
  if (fromMe) {
    // casa com envio do CRM pelo id ou por conexão+destino+texto nos últimos 60 s
    let matched = false
    try {
      const byId = $app.findRecordsByFilter(
        'outbound_messages',
        'connection = {:c} && provider_message_id = {:m}',
        '',
        1,
        0,
        { c: conn.id, m: waMessageId },
      )
      if (byId.length > 0) {
        matched = true
        authorKind = byId[0].getString('kind') === 'acolhimento' ? 'automatico' : 'equipe_crm'
      }
    } catch (_) {}
    if (!matched) {
      try {
        const text = String(data.message || data.text || '')
        const recent = $app.findRecordsByFilter(
          'outbound_messages',
          'connection = {:c} && to_phone = {:p} && text = {:t}',
          '-created',
          3,
          0,
          { c: conn.id, p: phone, t: text },
        )
        if (recent.length > 0) {
          const when = new Date(String(recent[0].getString('created')).replace(' ', 'T'))
          if (!isNaN(when.getTime()) && Date.now() - when.getTime() <= 60000) {
            matched = true
            authorKind = recent[0].getString('kind') === 'acolhimento' ? 'automatico' : 'equipe_crm'
          }
        }
      } catch (_) {}
    }
    if (!matched)
      authorKind = conn.getBool('other_bot_active') ? 'celular_ou_robo' : 'equipe_celular'
  }

  const mediaMeta = data.media_data
    ? {
        mimetype: String(data.media_data.mimetype || ''),
        filename: String(data.media_data.filename || ''),
        caption: String(data.media_data.caption || ''),
        duration: data.media_data.duration || null,
      }
    : null

  const msg = new Record($app.findCollectionByNameOrId('messages'))
  msg.set('connection', conn.id)
  msg.set('conversation', conv.id)
  msg.set('wa_message_id', waMessageId)
  msg.set('direction', fromMe ? 'saida' : 'entrada')
  msg.set('author_kind', authorKind)
  msg.set('type', String(data.type || 'text').slice(0, 40))
  msg.set('text', String(data.message || data.text || '').slice(0, 5000))
  if (mediaMeta) msg.set('media_meta', JSON.stringify(mediaMeta))
  if (data.media_url && !isHistory) msg.set('media_url', String(data.media_url).slice(0, 1000))
  msg.set('origin_ts', new Date(Number(data.timestamp) || Date.now()).toISOString())
  msg.set('received_at', new Date().toISOString())
  msg.set('status', 'recebida')
  msg.set('from_history', isHistory)
  msg.set('is_fixture', conn.getBool('is_fixture'))
  $app.save(msg)

  // ---------- marcações de tempo da conversa ----------
  try {
    const nowIso = new Date().toISOString()
    if (fromMe) conv.set('last_outbound_at', nowIso)
    else {
      conv.set('last_inbound_at', nowIso)
      // janela de 24 h a partir da última mensagem do paciente
      conv.set('window_expires_at', new Date(Date.now() + 86400000).toISOString())
    }
    $app.save(conv)
  } catch (_) {}

  // ---------- RN-18: histórico não cria item, alerta nem tempo ----------
  if (isHistory) {
    receipt(dedupeKey, event, sessionId, refId, 'gravada', 200, '')
    return e.json(200, { ok: true, result: 'gravada', history: true })
  }

  // ---------- item de fila + tempo de espera (só mensagem nova do paciente) ----------
  // RN-27: conversa marcada como "Não é paciente" entra SÓ na caixa — sem item de fila,
  // sem alerta, sem oportunidade e sem acolhimento. Este guarda garante isso.
  if (!fromMe && conv.getString('link_state') !== 'nao_paciente') {
    try {
      let item = null
      if (conv.getString('service_item')) {
        try {
          item = $app.findRecordById('service_items', conv.getString('service_item'))
        } catch (_) {}
      }
      const isOpen =
        item &&
        (item.getString('status') === 'pendente' || item.getString('status') === 'em_andamento')
      if (!isOpen) {
        const novo = new Record($app.findCollectionByNameOrId('service_items'))
        // oportunidade é opcional em itens de WhatsApp (revisar vínculo não tem ficha)
        if (conv.getString('opportunity')) novo.set('opportunity', conv.getString('opportunity'))
        novo.set('title', 'Responder no WhatsApp')
        novo.set('status', 'pendente')
        novo.set('channel', 'whatsapp')
        novo.set('conversation', conv.id)
        novo.set('wait_started_at', new Date().toISOString())
        novo.set('last_activity_at', new Date().toISOString())
        novo.set('response_measure', 'real')
        const assignee = conv.getString('assignee') || conn.getString('default_owner')
        if (assignee) novo.set('assignee', assignee)
        $app.save(novo)
        item = novo
        conv.set('service_item', novo.id)
        $app.save(conv)
      } else {
        // nova espera: o relógio da resposta recomeçou
        item.set('wait_started_at', new Date().toISOString())
        item.set('first_human_reply_at', '')
        item.set('first_human_reply_source', '')
        item.set('last_activity_at', new Date().toISOString())
        if (item.getString('status') === 'concluido') item.set('status', 'pendente')
        $app.save(item)
      }
    } catch (_) {}
  }

  // ---------- RN-20: acolhimento (texto fixo) ----------
  // Só entra na fila de saída; nada é enviado agora se a conexão não estiver conectada.
  if (!fromMe && !isHistory && conv.getString('link_state') !== 'nao_paciente') {
    try {
      const mode = conn.getString('greeting_mode')
      const testList = String(conn.getString('greeting_test_phones') || '')
      const isTestPhone = phone && testList.split(',').some((p) => p.trim() === phone)
      const approved = !!conn.getString('greeting_approved_by')
      const shouldGreet =
        approved && (mode === 'ligado' || (mode === 'somente_teste' && isTestPhone))
      if (shouldGreet) {
        // horário de funcionamento para escolher o texto
        let text = conn.getString('greeting_text_open')
        try {
          const s = $app.findFirstRecordByFilter('clinic_settings', "settings_key = 'main'")
          const toMin = (v) => {
            const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim())
            return m ? Number(m[1]) * 60 + Number(m[2]) : null
          }
          const start = toMin(s.getString('business_hours_start'))
          const end = toMin(s.getString('business_hours_end'))
          const now = new Date()
          const sp = (((now.getUTCHours() * 60 + now.getUTCMinutes() - 180) % 1440) + 1440) % 1440
          if (start !== null && end !== null && (sp < start || sp >= end)) {
            text = conn.getString('greeting_text_closed')
          }
        } catch (_) {}
        if (text) {
          const item = conv.getString('service_item')
          const key = 'acolhimento:' + item + ':' + conv.getString('last_inbound_at')
          const dup = $app.findRecordsByFilter(
            'outbound_messages',
            'idempotency_key = {:k}',
            '',
            1,
            0,
            {
              k: key,
            },
          )
          if (dup.length === 0) {
            const out = new Record($app.findCollectionByNameOrId('outbound_messages'))
            out.set('connection', conn.id)
            out.set('conversation', conv.id)
            out.set('to_phone', phone)
            out.set('kind', 'acolhimento')
            out.set('text', text)
            out.set('idempotency_key', key)
            out.set('state', 'pendente')
            out.set('attempts', 0)
            out.set('is_fixture', conn.getBool('is_fixture'))
            $app.save(out)
          }
        }
      }
    } catch (_) {}
  }

  receipt(dedupeKey, event, sessionId, refId, sessionResult || 'gravada', 200, '')
  return e.json(200, { ok: true, result: 'gravada' })
})
