// AL-F4-01: rotas da conexão do WhatsApp (SPEC AL-F4-A, CA-4-09/16).
// Regras que estas rotas respeitam:
// - A chave da D-API NUNCA aparece na tela nem no log; é lida só no servidor por $secrets.
// - O sessionId é exibido MASCARADO (só os 4 últimos).
// - Nenhuma conexão real é conectada aqui: a única conexão criada por rota é a FIXTURE
//   (`is_fixture=true`, status `demonstracao`), usada para provar tudo antes da sessão de
//   ativação. A conexão real só vira `conectado` na AL-F4-06, com o Dr.
// - `ligado` no acolhimento exige `other_bot_active=false`; com a Clara ativa no número,
//   fica em `somente_teste` (decisão do Dr. e SPEC).
// POCKETBASE JSVM: cada callback roda em VM própria — TODO helper mora DENTRO do callback.

// ---------- estado da conexão para a tela ----------
routerAdd(
  'GET',
  '/backend/v1/whatsapp/conexao',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    if (u.getString('role') !== 'admin') return e.forbiddenError('Apenas o administrador.')

    const maskSession = (s) => {
      const v = String(s || '')
      if (v.length <= 4) return v ? '••••' + v : ''
      return '••••' + v.slice(-4)
    }
    const hasSecret = (k) => {
      try {
        const v = $secrets.get(k)
        return !!(v && String(v).trim())
      } catch (_) {
        return false
      }
    }

    const list = $app.findRecordsByFilter('channel_connections', '', '-created', 20, 0)
    const out = []
    for (const c of list) {
      out.push({
        id: c.id,
        label: c.getString('label'),
        phone_number: c.getString('phone_number'),
        session_id_masked: maskSession(c.getString('session_id')),
        mode: c.getString('mode'),
        status: c.getString('status'),
        status_reason: c.getString('status_reason'),
        last_event_at: c.getString('last_event_at'),
        token_rotated_at: c.getString('token_rotated_at'),
        active: c.getBool('active'),
        is_fixture: c.getBool('is_fixture'),
        other_bot_active: c.getBool('other_bot_active'),
        greeting_mode: c.getString('greeting_mode'),
        greeting_text_open: c.getString('greeting_text_open'),
        greeting_text_closed: c.getString('greeting_text_closed'),
        greeting_approved_at: c.getString('greeting_approved_at'),
        greeting_test_phones: c.getString('greeting_test_phones'),
      })
    }

    return e.json(200, {
      connections: out,
      secrets: {
        // presença do segredo, NUNCA o valor
        DAPI_API_KEY: hasSecret('DAPI_API_KEY'),
        DAPI_WEBHOOK_TOKEN: hasSecret('DAPI_WEBHOOK_TOKEN'),
        DAPI_WEBHOOK_TOKEN_ANTERIOR: hasSecret('DAPI_WEBHOOK_TOKEN_ANTERIOR'),
      },
      rules: {
        greeting_live_requires: 'other_bot_active = false e autorização registrada do Dr.',
        read_only: 'Nenhum evento de paciente é enviado a plataformas nesta fase.',
        coexistence: 'O número continua no WhatsApp Business do celular (D-API em coexistência).',
      },
    })
  },
  $apis.requireAuth(),
)

// ---------- criar/atualizar a conexão ----------
routerAdd(
  'POST',
  '/backend/v1/whatsapp/conexao',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    if (u.getString('role') !== 'admin') return e.forbiddenError('Apenas o administrador.')
    const b = e.requestInfo().body || {}

    const id = String(b.id || '')
    let rec
    if (id) {
      try {
        rec = $app.findRecordById('channel_connections', id)
      } catch (_) {
        return e.notFoundError('Conexão não encontrada.')
      }
    } else {
      // Criação pela tela = conexão real em `desconectado` (sem sessionId, webhook inativo).
      rec = new Record($app.findCollectionByNameOrId('channel_connections'))
      rec.set('provider', 'dapi')
      rec.set('mode', 'coexistencia')
      rec.set('status', 'desconectado')
      rec.set('active', true)
      rec.set('is_fixture', false)
      rec.set('greeting_mode', 'desligado')
    }

    if (b.label !== undefined) rec.set('label', String(b.label).slice(0, 120))
    if (b.phone_number !== undefined) {
      // normaliza: só dígitos, com 55 (formato que a D-API espera no envio)
      let digits = String(b.phone_number || '').replace(/\D/g, '')
      if (digits && digits.length >= 10 && digits.indexOf('55') !== 0) digits = '55' + digits
      rec.set('phone_number', digits.slice(0, 15))
    }
    if (b.other_bot_active !== undefined) rec.set('other_bot_active', !!b.other_bot_active)
    if (b.active !== undefined) rec.set('active', !!b.active)
    if (b.default_owner !== undefined) rec.set('default_owner', String(b.default_owner || ''))

    if (b.greeting_mode !== undefined) {
      const mode = String(b.greeting_mode)
      if (mode === 'ligado') {
        // regra dura: com robô ativo no número, não pode ligar
        if (rec.getBool('other_bot_active')) {
          return e.badRequestError(
            'Não é possível ligar o acolhimento com a Clara (ou outro robô) ainda ativa neste número.',
          )
        }
        rec.set('greeting_live_authorized_by', u.id)
        rec.set('greeting_live_authorized_at', new Date().toISOString())
      }
      rec.set('greeting_mode', mode)
    }
    if (b.greeting_text_open !== undefined) {
      rec.set('greeting_text_open', String(b.greeting_text_open).slice(0, 1000))
    }
    if (b.greeting_text_closed !== undefined) {
      rec.set('greeting_text_closed', String(b.greeting_text_closed).slice(0, 1000))
    }
    if (b.greeting_test_phones !== undefined) {
      rec.set(
        'greeting_test_phones',
        String(b.greeting_test_phones)
          .replace(/[^\d,]/g, '')
          .slice(0, 500),
      )
    }
    if (b.greeting_text_open !== undefined || b.greeting_text_closed !== undefined) {
      rec.set('greeting_approved_by', u.id)
      rec.set('greeting_approved_at', new Date().toISOString())
    }

    try {
      $app.save(rec)
    } catch (err) {
      return e.badRequestError('Não foi possível salvar: ' + String(err))
    }
    return e.json(200, { id: rec.id, status: rec.getString('status') })
  },
  $apis.requireAuth(),
)

// ---------- criar a conexão FIXTURE (só para provas; some ao final da fase) ----------
routerAdd(
  'POST',
  '/backend/v1/whatsapp/fixture/conexao',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    if (u.getString('role') !== 'admin') return e.forbiddenError('Apenas o administrador.')

    // sem o segredo de prova, a rota responde 404 (não revela que existe)
    let secretOk = false
    try {
      const expected = String($secrets.get('FIXTURE_SECRET') || '')
      const got = String(e.request.header.get('X-Fixture-Secret') || '')
      secretOk = expected !== '' && expected === got
    } catch (_) {}
    if (!secretOk) return e.notFoundError()

    const existing = $app.findRecordsByFilter('channel_connections', 'is_fixture = true', '', 1, 0)
    if (existing.length > 0) {
      return e.json(200, { id: existing[0].id, reused: true })
    }

    const rec = new Record($app.findCollectionByNameOrId('channel_connections'))
    rec.set('provider', 'dapi')
    rec.set('label', 'Conexão de demonstração')
    rec.set('phone_number', '5511900000000') // número fictício, não é o da clínica
    rec.set('session_id', 'fixture-session-0001')
    rec.set('mode', 'coexistencia')
    rec.set('status', 'demonstracao')
    rec.set('active', true)
    rec.set('is_fixture', true)
    rec.set('other_bot_active', false)
    rec.set('greeting_mode', 'desligado')
    $app.save(rec)
    return e.json(201, { id: rec.id, reused: false })
  },
  $apis.requireAuth(),
)
