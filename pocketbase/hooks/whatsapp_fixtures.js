// AL-F4-02B: rotas de PROVA da D-API (fixtures). Somem ao final da fase (RN-40).
// Sem `FIXTURE_SECRET` no cofre ou sem o cabeçalho correto, respondem 404 — não revelam
// que existem. Nunca chamam a D-API real e nunca tocam em número de paciente.
// POCKETBASE JSVM: cada callback roda em VM própria — todo helper mora DENTRO do callback.

// ---------- preparar a conexão fixture para uma prova ----------
routerAdd(
  'POST',
  '/backend/v1/fixtures/dapi/preparar',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    if (u.getString('role') !== 'admin') return e.forbiddenError('Apenas o administrador.')

    let expected = ''
    try {
      expected = String($secrets.get('FIXTURE_SECRET') || '')
    } catch (_) {}
    const got = String(e.request.header.get('X-Fixture-Secret') || '')
    if (!expected || expected !== got) return e.notFoundError()

    const b = e.requestInfo().body || {}
    const conns = $app.findRecordsByFilter('channel_connections', 'is_fixture = true', '', 1, 0)
    if (conns.length === 0) return e.badRequestError('Crie a conexão fixture primeiro.')
    const conn = conns[0]

    if (b.window_expired_conversation !== undefined) {
      // força a janela de 24 h vencida numa conversa, para provar a recusa de envio
      try {
        const cv = $app.findRecordById('conversations', String(b.window_expired_conversation))
        cv.set('window_expires_at', new Date(Date.now() - 3600000).toISOString())
        $app.save(cv)
      } catch (_) {}
    }
    if (b.status !== undefined) conn.set('status', String(b.status))
    if (b.greeting_mode !== undefined) conn.set('greeting_mode', String(b.greeting_mode))
    if (b.greeting_text_open !== undefined)
      conn.set('greeting_text_open', String(b.greeting_text_open))
    if (b.greeting_text_closed !== undefined)
      conn.set('greeting_text_closed', String(b.greeting_text_closed))
    if (b.greeting_test_phones !== undefined)
      conn.set('greeting_test_phones', String(b.greeting_test_phones))
    if (b.other_bot_active !== undefined) conn.set('other_bot_active', !!b.other_bot_active)
    if (b.approve_greeting === true) {
      conn.set('greeting_approved_by', u.id)
      conn.set('greeting_approved_at', new Date().toISOString())
    }
    if (b.send_plan !== undefined) {
      conn.set('fixture_send_plan', JSON.stringify(b.send_plan || []))
      conn.set('fixture_send_calls', 0)
    }
    $app.save(conn)
    return e.json(200, { id: conn.id, status: conn.getString('status') })
  },
  $apis.requireAuth(),
)

// ---------- simular entrega/leitura de uma mensagem ----------
routerAdd(
  'POST',
  '/backend/v1/fixtures/dapi/status',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    let expected = ''
    try {
      expected = String($secrets.get('FIXTURE_SECRET') || '')
    } catch (_) {}
    if (!expected || expected !== String(e.request.header.get('X-Fixture-Secret') || '')) {
      return e.notFoundError()
    }
    const b = e.requestInfo().body || {}
    const waId = String(b.wa_message_id || '').toLowerCase()
    const next = String(b.next || 'entregue')
    const found = $app.findRecordsByFilter('messages', 'wa_message_id = {:m}', '', 1, 0, {
      m: waId,
    })
    if (found.length === 0) return e.notFoundError('Mensagem não encontrada.')
    const msg = found[0]
    const order = { aceita: 1, entregue: 2, lida: 3 }
    if ((order[next] || 0) > (order[msg.getString('status')] || 0)) {
      msg.set('status', next)
      msg.set('status_at', new Date().toISOString())
      $app.save(msg)
    }
    return e.json(200, { status: msg.getString('status') })
  },
  $apis.requireAuth(),
)
