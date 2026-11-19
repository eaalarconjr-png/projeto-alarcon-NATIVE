// MCP Admin (nov/2026): servidor MCP (Model Context Protocol) sobre JSON-RPC 2.0.
// Uma rota customizada (POST /backend/v1/mcp) que expõe as ferramentas do app.
// Autenticação: header `Authorization: Bearer <token>` — token gerado no painel
// admin e guardado em mcp_settings (sem OAuth externo, sem segredo de terceiros).
// Métodos: initialize, notifications/initialized, ping, tools/list, tools/call.
//
// POCKETBASE JSVM: cada callback roda em VM própria — TODO helper mora DENTRO do callback.

// ---------- POST /backend/v1/mcp: o endpoint MCP (JSON-RPC 2.0) ----------
routerAdd('POST', '/backend/v1/mcp', (e) => {
  // ---------- helpers (dentro do callback: exigência da JSVM) ----------
  const isInternal = (name) => String(name || '').startsWith('_')
  const sendJsonRpc = (id, result) => e.json(200, { jsonrpc: '2.0', id, result })
  const sendError = (id, code, message) =>
    e.json(200, { jsonrpc: '2.0', id, error: { code, message } })

  const toolsList = () => [
    {
      name: 'list_collections',
      description:
        'Lista as coleções de dados do app com a contagem de registros e os nomes dos campos. Use antes de consultar registros para descobrir o que existe.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_records',
      description:
        'Consulta registros de uma coleção com filtro (PocketBase filter string, ex.: phone ~ "1199"), paginação (page, per_page) e ordenação (sort, ex.: -created).',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Nome da coleção' },
          filter: { type: 'string', description: 'Filtro PocketBase (opcional)' },
          sort: { type: 'string', description: 'Ordenação (opcional, ex.: -created)' },
          page: { type: 'number', description: 'Página, começa em 1 (padrão 1)' },
          per_page: { type: 'number', description: 'Itens por página (padrão 20, máximo 50)' },
        },
        required: ['collection'],
      },
    },
    {
      name: 'get_record',
      description: 'Busca um registro pelo id.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
          id: { type: 'string' },
        },
        required: ['collection', 'id'],
      },
    },
  ]

  const findCollection = (name) => {
    const n = String(name || '')
    if (!n || isInternal(n)) throw new Error('Coleção inválida: ' + (n || '(vazio)'))
    const col = $app.findCollectionByNameOrId(n)
    if (col.type !== 'base') throw new Error('Coleção não exposta pelo MCP: ' + n)
    return col
  }

  const callTool = (name, args) => {
    args = args || {}
    if (name === 'list_collections') {
      const cols = $app
        .findAllCollections()
        .filter((c) => c.type === 'base' && !isInternal(c.name))
        .sort((a, b) => (a.name < b.name ? -1 : 1))
      const out = cols.map((c) => {
        let count = 0
        try {
          count = $app.countRecords(c.name)
        } catch (_) {}
        const fields = c.fields
          .filter((f) => f.type !== 'autodate')
          .map((f) => f.name + ' (' + f.type + ')')
        return { name: c.name, records: count, fields }
      })
      return {
        collections: out,
        total_collections: out.length,
        total_records: out.reduce((acc, c) => acc + c.records, 0),
      }
    }
    if (name === 'list_records') {
      const col = findCollection(args.collection)
      const perPage = Math.min(Math.max(Number(args.per_page) || 20, 1), 50)
      const page = Math.max(Number(args.page) || 1, 1)
      const filter = String(args.filter || '').trim()
      const sort = String(args.sort || '-created').trim()
      const records = $app.findRecordsByFilter(
        col.name,
        filter,
        sort,
        perPage,
        (page - 1) * perPage,
      )
      const total = $app.countRecords(col.name, filter)
      const rows = records.map((r) => r.publicExport())
      return {
        collection: col.name,
        page,
        per_page: perPage,
        total_records: total,
        total_pages: Math.ceil(total / perPage),
        records: rows,
      }
    }
    if (name === 'get_record') {
      const col = findCollection(args.collection)
      const id = String(args.id || '')
      if (!id) throw new Error('Informe o id do registro.')
      try {
        const r = $app.findRecordById(col.name, id)
        return { collection: col.name, record: r.publicExport() }
      } catch (_) {
        throw new Error('Registro não encontrado: ' + id)
      }
    }
    throw new Error('Ferramenta desconhecida: ' + name)
  }

  // ---------- autenticação (header Authorization: Bearer) ----------
  let token = ''
  try {
    const h = String(e.request.header.get('Authorization') || '')
    token = h.startsWith('Bearer ') ? h.slice(7).trim() : h.trim()
  } catch (_) {}
  let cred = null
  try {
    cred = $app.findFirstRecordByFilter('mcp_settings', "settings_key = 'mcp'")
  } catch (_) {}
  const tokenOk =
    token &&
    cred &&
    cred.getBool('enabled') !== false &&
    String(cred.getString('api_token')) === token
  if (!tokenOk) {
    return e.json(401, {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message:
          'Token ausente, inválido ou revogado. Envie o header Authorization: Bearer <token>.',
      },
    })
  }

  // ---------- JSON-RPC ----------
  const body = e.requestInfo().body || {}
  const method = String(body.method || '')
  const id = body.id === undefined ? null : body.id

  if (method === 'initialize') {
    return sendJsonRpc(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'alarcon-admin-mcp', version: '1.0.0' },
    })
  }
  if (method === 'notifications/initialized') {
    return e.json(202, {})
  }
  if (method === 'ping') {
    return sendJsonRpc(id, {})
  }
  if (method === 'tools/list') {
    return sendJsonRpc(id, { tools: toolsList() })
  }
  if (method === 'tools/call') {
    const params = body.params || {}
    const name = String(params.name || '')
    let result
    try {
      result = callTool(name, params.arguments)
    } catch (err) {
      return sendJsonRpc(id, {
        content: [{ type: 'text', text: String(err && err.message ? err.message : err) }],
        isError: true,
      })
    }
    return sendJsonRpc(id, {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    })
  }

  return sendError(id, -32601, 'Método não suportado: ' + method)
})

// ---------- log de chamadas (best-effort, fora da resposta) ----------
routerAdd('POST', '/backend/v1/mcp/log', (e) => {
  try {
    const cred = $app.findFirstRecordByFilter('mcp_settings', "settings_key = 'mcp'")
    cred.set('last_call_at', new Date().toISOString())
    cred.set('call_count', cred.getInt('call_count', 0) + 1)
    $app.save(cred)
  } catch (_) {}
  return e.json(200, {})
})

// ---------- GET /backend/v1/mcp/state: estado para o painel admin ----------
routerAdd(
  'GET',
  '/backend/v1/mcp/state',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    if (u.getString('role') !== 'admin') return e.forbiddenError('Apenas o administrador.')

    const isInternal = (name) => String(name || '').startsWith('_')
    let cred = null
    try {
      cred = $app.findFirstRecordByFilter('mcp_settings', "settings_key = 'mcp'")
    } catch (_) {}
    // bootstrap: primeiro acesso ao painel cria a credencial (rota já exige admin)
    if (!cred) {
      const token = 'mcp_' + $security.randomString(32)
      cred = new Record($app.findCollectionByNameOrId('mcp_settings'))
      cred.set('settings_key', 'mcp')
      cred.set('api_token', token)
      cred.set('token_hint', token.slice(-6))
      cred.set('token_rotated_at', new Date().toISOString())
      cred.set('endpoint_path', MCP_PATH)
      cred.set('enabled', true)
      cred.set('description', 'Token do servidor MCP do painel admin (acesso de leitura aos dados)')
      $app.save(cred)
    }

    const collections = $app
      .findAllCollections()
      .filter((c) => c.type === 'base' && !isInternal(c.name))
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map((c) => {
        let count = 0
        try {
          count = $app.countRecords(c.name)
        } catch (_) {}
        return { name: c.name, records: count }
      })

    const tools = [
      {
        name: 'list_collections',
        description:
          'Lista as coleções de dados do app com a contagem de registros e os nomes dos campos.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'list_records',
        description:
          'Consulta registros de uma coleção com filtro, paginação (page, per_page) e ordenação (sort).',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string' },
            filter: { type: 'string' },
            sort: { type: 'string' },
            page: { type: 'number' },
            per_page: { type: 'number' },
          },
          required: ['collection'],
        },
      },
      {
        name: 'get_record',
        description: 'Busca um registro pelo id.',
        inputSchema: {
          type: 'object',
          properties: { collection: { type: 'string' }, id: { type: 'string' } },
          required: ['collection', 'id'],
        },
      },
    ]

    return e.json(200, {
      endpoint_url: e.request.url.proto + '//' + e.request.host + MCP_PATH,
      token: cred ? cred.getString('api_token') : '',
      token_hint: cred ? cred.getString('token_hint') : '',
      token_rotated_at: cred ? cred.getString('token_rotated_at') : '',
      enabled: cred ? cred.getBool('enabled') : false,
      last_call_at: cred ? cred.getString('last_call_at') : '',
      call_count: cred ? cred.getInt('call_count', 0) : 0,
      collections,
      tools,
    })
  },
  $apis.requireAuth(),
)

// ---------- POST /backend/v1/mcp/regenerar-token: rotação pelo painel ----------
routerAdd(
  'POST',
  '/backend/v1/mcp/regenerar-token',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    if (u.getString('role') !== 'admin') return e.forbiddenError('Apenas o administrador.')

    let cred = null
    try {
      cred = $app.findFirstRecordByFilter('mcp_settings', "settings_key = 'mcp'")
    } catch (_) {}
    if (!cred) {
      cred = new Record($app.findCollectionByNameOrId('mcp_settings'))
    }
    const token = 'mcp_' + $security.randomString(32)
    cred.set('settings_key', 'mcp')
    cred.set('api_token', token)
    cred.set('token_hint', token.slice(-6))
    cred.set('token_rotated_at', new Date().toISOString())
    cred.set('endpoint_path', '/backend/v1/mcp')
    cred.set('enabled', true)
    cred.set('description', 'Token do servidor MCP do painel admin (acesso de leitura aos dados)')
    $app.save(cred)
    return e.json(200, { token, token_hint: token.slice(-6) })
  },
  $apis.requireAuth(),
)
