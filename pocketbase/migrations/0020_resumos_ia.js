// AL-F4-05 / AL-F4-05B — registros de resumo por IA (SPEC AL-F4-B).
// A IA SUGERE; quem decide é a pessoa. Nada muda na oportunidade sem clique humano.
// Guarda a resposta bruta do modelo para auditoria (leitura só admin, escrita só servidor),
// o status (ok/erro/invalido) e a decisão humana (aceita/trocada/recusada/expirada).
// Nenhum texto de paciente sai daqui para lugar nenhum: só fica gravado para a equipe ler.
migrate(
  (app) => {
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const inboxRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'atendimento')"

    const convsId = app.findCollectionByNameOrId('conversations').id
    const oppsId = app.findCollectionByNameOrId('opportunities').id

    // 1. conversation_summaries
    const summaries = new Collection({
      name: 'conversation_summaries',
      type: 'base',
      listRule: inboxRule,
      viewRule: inboxRule,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'conversation',
          type: 'relation',
          required: true,
          collectionId: convsId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'opportunity',
          type: 'relation',
          collectionId: oppsId,
          maxSelect: 1,
        },
        // botao = alguém clicou em Resumir; cron = rotina automática da AL-F4-05B
        {
          name: 'trigger',
          type: 'select',
          values: ['botao', 'cron'],
          required: true,
          maxSelect: 1,
        },
        // resumo validado (até 600 caracteres, conforme RN-34)
        { name: 'summary', type: 'text', max: 600 },
        { name: 'points', type: 'json', maxSize: 20000 },
        { name: 'suggested_stage', type: 'text', max: 40 },
        { name: 'justification', type: 'text', max: 1000 },
        { name: 'clinical_signal', type: 'bool' },
        // resposta bruta do modelo, para auditoria (não exibida direto)
        { name: 'raw_response', type: 'text', max: 20000 },
        { name: 'messages_used', type: 'number', onlyInt: true, min: 0 },
        {
          name: 'status',
          type: 'select',
          values: ['ok', 'erro', 'invalido'],
          required: true,
          maxSelect: 1,
        },
        { name: 'error_code', type: 'text', max: 80 },
        // decisão humana: a IA nunca decide sozinha
        {
          name: 'decision',
          type: 'select',
          values: ['pendente', 'aceita', 'trocada', 'recusada', 'expirada'],
          required: true,
          maxSelect: 1,
        },
        { name: 'decided_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'decided_at', type: 'date' },
        { name: 'final_stage', type: 'text', max: 40 },
        // controle da rotina automática (AL-F4-05B)
        { name: 'is_fixture', type: 'bool' },
      ],
      indexes: [
        'CREATE INDEX idx_summaries_conv ON conversation_summaries (conversation, created)',
        'CREATE INDEX idx_summaries_decision ON conversation_summaries (decision)',
      ],
    })
    summaries.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    summaries.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(summaries)

    // 2. clinic_settings: liga/desliga e teto diário (padrão DESLIGADO — decisão do Dr.)
    const settings = app.findCollectionByNameOrId('clinic_settings')
    if (!settings.fields.getByName('ai_summary_enabled')) {
      settings.fields.add(new BoolField({ name: 'ai_summary_enabled' }))
    }
    if (!settings.fields.getByName('ai_daily_cap')) {
      settings.fields.add(new NumberField({ name: 'ai_daily_cap', onlyInt: true, min: 0 }))
    }
    // controle do resumo automático (AL-F4-05B): última mensagem/ tentativa por conversa
    const convs = app.findCollectionByNameOrId('conversations')
    if (!convs.fields.getByName('ai_last_message_id')) {
      convs.fields.add(new TextField({ name: 'ai_last_message_id', max: 200 }))
    }
    if (!convs.fields.getByName('ai_last_attempt_message_id')) {
      convs.fields.add(new TextField({ name: 'ai_last_attempt_message_id', max: 200 }))
    }
    if (!convs.fields.getByName('ai_last_summary_at')) {
      convs.fields.add(new DateField({ name: 'ai_last_summary_at' }))
    }
    app.save(convs)

    // padrão: desligado, teto 200 (a SPEC pede 200 como padrão)
    try {
      const main = app.findFirstRecordByFilter('clinic_settings', "settings_key = 'main'")
      if (main.get('ai_summary_enabled') === null || main.get('ai_summary_enabled') === undefined) {
        main.set('ai_summary_enabled', false)
      }
      if (!main.getInt('ai_daily_cap')) main.set('ai_daily_cap', 200)
      app.save(main)
    } catch (_) {}

    app.save(settings)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('conversation_summaries'))
    } catch (_) {}
    try {
      const convs = app.findCollectionByNameOrId('conversations')
      for (const f of ['ai_last_message_id', 'ai_last_attempt_message_id', 'ai_last_summary_at']) {
        if (convs.fields.getByName(f)) convs.fields.removeByName(f)
      }
      app.save(convs)
    } catch (_) {}
    try {
      const settings = app.findCollectionByNameOrId('clinic_settings')
      for (const f of ['ai_summary_enabled', 'ai_daily_cap']) {
        if (settings.fields.getByName(f)) settings.fields.removeByName(f)
      }
      app.save(settings)
    } catch (_) {}
  },
)
