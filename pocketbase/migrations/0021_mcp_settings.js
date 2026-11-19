// MCP Admin (nov/2026): coleção de credencial do servidor MCP do painel admin.
// Um ÚNICO registro (settings_key = 'mcp') guarda o token de API próprio do app
// (sem OAuth externo, sem segredo de terceiros) e os metadados exibidos na tela.
// Regras: NADA de leitura/escrita pública — tudo passa pelas rotas do hook
// mcp_server.js (o painel autentica como admin do PocketBase; o endpoint MCP
// autentica pelo header Authorization com o token).
migrate(
  (app) => {
    // idempotente: já aplicada em outra cópia → nada a fazer
    try {
      app.findCollectionByNameOrId('mcp_settings')
      return
    } catch (_) {}

    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const col = new Collection({
      name: 'mcp_settings',
      type: 'base',
      listRule: adminRule,
      viewRule: adminRule,
      createRule: null, // só o hook cria/rotaciona
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'settings_key', type: 'text', required: true, max: 40 },
        { name: 'api_token', type: 'text', required: true, max: 120, hidden: true },
        { name: 'token_hint', type: 'text', max: 12 },
        { name: 'token_rotated_at', type: 'date' },
        { name: 'endpoint_path', type: 'text', max: 200 },
        { name: 'enabled', type: 'bool' },
        { name: 'last_call_at', type: 'date' },
        { name: 'call_count', type: 'number', onlyInt: true, min: 0 },
        { name: 'description', type: 'text', max: 500 },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_mcp_settings_key ON mcp_settings (settings_key)'],
    })
    col.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    col.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('mcp_settings'))
    } catch (_) {}
  },
)
