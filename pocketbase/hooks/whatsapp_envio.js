// AL-F4-02B: envio de respostas pelo CRM (SPEC AL-F4-A, RN-14 a RN-17, CA-4-04/05/23).
// Regras que este arquivo respeita:
// - Só responde DENTRO da janela de 24 h. Fora dela, só modelo aprovado (fase 5) — recusa 409.
// - NUNCA reenvia às cegas: 5xx/timeout vira `reconciliar` e uma pessoa decide.
// - Impede envio duplicado por chave de idempotência (uma por rascunho).
// - Grava `em_envio` ANTES de chamar a D-API, para o estado nunca mentir.
// - Com a conexão fixture, NÃO chama a D-API: usa o plano da fixture (RN-40).
// - Nenhuma mensagem vai para paciente real nesta fase: a conexão real não existe ainda.
// POCKETBASE JSVM: cada callback roda em VM própria — todo helper mora DENTRO do callback.

// ======================= ENVIAR =======================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/enviar',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    const role = u.getString('role')
    if (role !== 'admin' && role !== 'atendimento') {
      return e.forbiddenError('Apenas quem atende pode responder.')
    }

    const b = e.requestInfo().body || {}
    const convId = String(b.conversation_id || '')
    const text = String(b.text || '').trim()
    const idemKey = String(b.idempotency_key || '')
    const kind = String(b.kind || 'resposta_humana')
    const declaredFromPhone = b.declared_from_phone === true

    if (!convId) return e.badRequestError('Informe a conversa.')
    if (text.length < 1 || text.length > 4096) {
      return e.badRequestError('A mensagem precisa ter entre 1 e 4.096 caracteres.')
    }
    if (!idemKey) return e.badRequestError('Envio sem chave de idempotência.')

    // RN-15: mesmo rascunho não envia duas vezes
    const dup = $app.findRecordsByFilter('outbound_messages', 'idempotency_key = {:k}', '', 1, 0, {
      k: idemKey,
    })
    if (dup.length > 0) {
      const prev = dup[0]
      return e.json(200, {
        outbound_id: prev.id,
        state: prev.getString('state'),
        reused: true,
      })
    }

    let conv
    try {
      conv = $app.findRecordById('conversations', convId)
    } catch (_) {
      return e.notFoundError('Conversa não encontrada.')
    }

    const linkState = conv.getString('link_state')
    if (linkState === 'nao_paciente' && b.confirmed_not_patient !== true) {
      return e.json(409, {
        ok: false,
        error: 'conversa_nao_paciente',
        message: 'Esta conversa está marcada como "não é paciente". Confirme para responder.',
      })
    }
    const phone = conv.getString('contact_phone')
    if (!phone) {
      return e.json(409, {
        ok: false,
        error: 'sem_telefone',
        message: 'Sem telefone: responda pelo celular.',
      })
    }

    let conn
    try {
      conn = $app.findRecordById('channel_connections', conv.getString('connection'))
    } catch (_) {
      return e.json(409, { ok: false, error: 'canal_indisponivel' })
    }
    if (!conn.getBool('active') || conn.getString('status') !== 'conectado') {
      return e.json(409, {
        ok: false,
        error: 'canal_indisponivel',
        message: 'Conexão do WhatsApp não está ativa. O atendimento segue pelo celular.',
      })
    }

    // RN-14: janela de 24 h (conferida no servidor, sempre)
    const windowRaw = conv.getString('window_expires_at')
    const windowDate = windowRaw ? new Date(String(windowRaw).replace(' ', 'T')) : null
    const insideWindow =
      windowDate && !isNaN(windowDate.getTime()) && windowDate.getTime() > Date.now()
    if (!insideWindow && kind !== 'teste') {
      return e.json(409, {
        ok: false,
        error: 'fora_da_janela',
        message:
          'Fora da janela de 24 h: só modelo aprovado, previsto na fase 5. Responda pelo celular.',
      })
    }

    // cria a linha da fila em `em_envio` ANTES da chamada (RN-16)
    const out = new Record($app.findCollectionByNameOrId('outbound_messages'))
    out.set('connection', conn.id)
    out.set('conversation', conv.id)
    out.set('to_phone', phone)
    out.set(
      'kind',
      kind === 'acolhimento' ? 'acolhimento' : kind === 'teste' ? 'teste' : 'resposta_humana',
    )
    out.set('text', text)
    out.set('idempotency_key', idemKey)
    out.set('requested_by', u.id)
    out.set('state', 'em_envio')
    out.set('attempts', 0)
    out.set('is_fixture', conn.getBool('is_fixture'))
    $app.save(out)

    // ---------- conexão FIXTURE: nunca chama a D-API (RN-40) ----------
    if (conn.getBool('is_fixture')) {
      let plan = []
      try {
        const raw = conn.getString('fixture_send_plan')
        plan = raw ? JSON.parse(raw) : []
      } catch (_) {}
      const calls = conn.getInt('fixture_send_calls', 0)
      const step = Array.isArray(plan) ? plan[calls] : null
      conn.set('fixture_send_calls', calls + 1)
      $app.save(conn)

      const stepKind = step ? String(step.result || step) : 'ok'

      const finish = (state, failReason, providerId) => {
        out.set('state', state)
        if (failReason) out.set('fail_reason', failReason)
        out.set('attempts', 1)
        if (providerId) out.set('provider_message_id', providerId)
        $app.save(out)
      }

      if (stepKind === 'ok' || stepKind === 'ok_sem_id') {
        const providerId = stepKind === 'ok' ? 'FIXTURE-OUT-' + out.id.slice(-8).toUpperCase() : ''
        finish('aceita', '', providerId)
        // grava a mensagem de saída (o eco também a criaria; o UNIQUE resolve)
        try {
          const waId = (providerId || 'fixture-text-' + out.id).toLowerCase()
          const exists = $app.findRecordsByFilter(
            'messages',
            'connection = {:c} && wa_message_id = {:m}',
            '',
            1,
            0,
            { c: conn.id, m: waId },
          )
          if (exists.length === 0) {
            const m = new Record($app.findCollectionByNameOrId('messages'))
            m.set('connection', conn.id)
            m.set('conversation', conv.id)
            m.set('wa_message_id', waId)
            m.set('direction', 'saida')
            m.set('author_kind', kind === 'acolhimento' ? 'automatico' : 'equipe_crm')
            m.set('author_user', u.id)
            m.set('type', 'text')
            m.set('text', text)
            m.set('origin_ts', new Date().toISOString())
            m.set('received_at', new Date().toISOString())
            m.set('status', 'aceita')
            m.set('is_fixture', true)
            const syncOut = $app.findRecordById('outbound_messages', out.id)
            syncOut.set('message', m.id)
            $app.save(syncOut)
            $app.save(m)
          }
        } catch (_) {}
        // registra o tempo real da primeira resposta humana (base da AL-F4-04)
        try {
          if (kind !== 'acolhimento' && conv.getString('service_item')) {
            const it = $app.findRecordById('service_items', conv.getString('service_item'))
            if (!it.getString('first_human_reply_at')) {
              it.set('first_human_reply_at', new Date().toISOString())
              it.set('first_human_reply_source', declaredFromPhone ? 'celular_declarado' : 'crm')
              it.set('response_measure', 'real')
              $app.save(it)
            }
          }
        } catch (_) {}
        return e.json(200, { outbound_id: out.id, state: 'aceita', simulated: true })
      }
      if (stepKind === '429') {
        out.set('state', 'falhou')
        out.set('fail_reason', 'limite_de_taxa')
        out.set('attempts', 1)
        $app.save(out)
        return e.json(200, {
          outbound_id: out.id,
          state: 'falhou',
          reason: 'limite_de_taxa',
          simulated: true,
        })
      }
      if (stepKind === '500' || stepKind === 'timeout') {
        finish('reconciliar', stepKind === 'timeout' ? 'timeout' : 'erro_do_provedor')
        return e.json(200, { outbound_id: out.id, state: 'reconciliar', simulated: true })
      }
      if (stepKind === '400') {
        finish('falhou', 'requisicao_invalida')
        return e.json(200, {
          outbound_id: out.id,
          state: 'falhou',
          reason: 'requisicao_invalida',
          simulated: true,
        })
      }
      if (stepKind === '401') {
        finish('falhou', 'chave_invalida')
        conn.set('status', 'erro')
        conn.set('status_reason', 'chave_invalida')
        $app.save(conn)
        return e.json(200, {
          outbound_id: out.id,
          state: 'falhou',
          reason: 'chave_invalida',
          simulated: true,
        })
      }
      // plano desconhecido: trata como sucesso
      finish('aceita', '', 'FIXTURE-OUT-' + out.id.slice(-8).toUpperCase())
      return e.json(200, { outbound_id: out.id, state: 'aceita', simulated: true })
    }

    // ---------- conexão REAL: chama a D-API ----------
    let apiKey = ''
    try {
      apiKey = String($secrets.get('DAPI_API_KEY') || '')
    } catch (_) {}
    if (!apiKey) {
      out.set('state', 'falhou')
      out.set('fail_reason', 'sem_chave_configurada')
      $app.save(out)
      return e.json(409, {
        ok: false,
        error: 'canal_indisponivel',
        message: 'Chave da D-API não cadastrada.',
      })
    }

    let result
    try {
      result = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/text',
        method: 'POST',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: conn.getString('session_id'), to: phone, text: text }),
        timeout: 10,
      })
    } catch (_) {
      // erro de transporte = resultado ambíguo (RN-17)
      out.set('state', 'reconciliar')
      out.set('fail_reason', 'erro_de_transporte')
      out.set('attempts', 1)
      $app.save(out)
      return e.json(200, { outbound_id: out.id, state: 'reconciliar' })
    }

    const code = result.statusCode
    let payload = {}
    try {
      payload = JSON.parse(result.raw || result.body || '{}')
    } catch (_) {}

    if (code >= 200 && code < 300) {
      const id = String(payload.id || (payload.data && payload.data.id) || '').toLowerCase()
      out.set('state', 'aceita')
      out.set('attempts', 1)
      if (id) out.set('provider_message_id', id)
      $app.save(out)
      return e.json(200, { outbound_id: out.id, state: 'aceita' })
    }
    if (code === 429) {
      out.set('state', 'pendente')
      out.set('fail_reason', 'limite_de_taxa')
      out.set('attempts', 1)
      out.set('next_attempt_at', new Date(Date.now() + 60000).toISOString())
      $app.save(out)
      return e.json(200, { outbound_id: out.id, state: 'pendente' })
    }
    if (code >= 500) {
      // não reenvia: a D-API não deduplica envio (RN-17)
      out.set('state', 'reconciliar')
      out.set('fail_reason', 'erro_do_provedor')
      out.set('attempts', 1)
      $app.save(out)
      return e.json(200, { outbound_id: out.id, state: 'reconciliar' })
    }
    if (code === 401 || code === 403) {
      out.set('state', 'falhou')
      out.set('fail_reason', 'chave_invalida')
      out.set('attempts', 1)
      $app.save(out)
      conn.set('status', 'erro')
      conn.set('status_reason', 'chave_invalida')
      $app.save(conn)
      return e.json(200, { outbound_id: out.id, state: 'falhou' })
    }
    out.set('state', 'falhou')
    out.set('fail_reason', 'requisicao_invalida')
    out.set('attempts', 1)
    out.set('last_error', String(result.raw || '').slice(0, 500))
    $app.save(out)
    return e.json(200, { outbound_id: out.id, state: 'falhou' })
  },
  $apis.requireAuth(),
)
