// AL-F4-01: coleções do canal WhatsApp (SPEC AL-F4-A).
// Cinco coleções: a conexão, as conversas, as mensagens, o recibo técnico de evento e a
// fila de saída. Todas nascem VAZIAS e sem nenhuma conexão real — a construção inteira até a
// sessão de ativação usa fixtures (decisão do Dr. e instrução da SPEC).
// Permissões: `admin` e `atendimento` leem a caixa; `gestor_trafego` NÃO vê conversa
// (a SPEC é explícita). Escrita só pelo servidor: create/update/delete nulos em todas.
migrate(
  (app) => {
    const usersId = '_pb_users_auth_'
    // leitura da caixa: admin e atendimento. Gestor de tráfego fica fora.
    const inboxRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'atendimento')"
    // conexão e log técnico: só admin
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"

    // ---------- 1. channel_connections ----------
    const conn = new Collection({
      name: 'channel_connections',
      type: 'base',
      listRule: adminRule,
      viewRule: adminRule,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'provider', type: 'select', values: ['dapi'], required: true, maxSelect: 1 },
        { name: 'label', type: 'text', max: 120 },
        // só dígitos, com 55 (formato que a D-API espera no envio)
        { name: 'phone_number', type: 'text', max: 15 },
        // sessionId da D-API; a tela mostra só os 4 últimos
        { name: 'session_id', type: 'text', max: 120 },
        { name: 'mode', type: 'select', values: ['coexistencia'], maxSelect: 1 },
        {
          name: 'status',
          type: 'select',
          values: ['desconectado', 'demonstracao', 'conectado', 'erro'],
          required: true,
          maxSelect: 1,
        },
        { name: 'status_reason', type: 'text', max: 300 },
        { name: 'last_event_at', type: 'date' },
        { name: 'token_rotated_at', type: 'date' },
        { name: 'last_status_raw', type: 'json', maxSize: 20000 },
        { name: 'active', type: 'bool' },
        { name: 'is_fixture', type: 'bool' },
        // "a Clara ou outro robô ainda responde neste número" — decide se o acolhimento
        // pode ir a `ligado` (exige false)
        { name: 'other_bot_active', type: 'bool' },
        { name: 'default_owner', type: 'relation', collectionId: usersId, maxSelect: 1 },
        {
          name: 'greeting_mode',
          type: 'select',
          values: ['desligado', 'somente_teste', 'ligado'],
          required: true,
          maxSelect: 1,
        },
        { name: 'greeting_text_open', type: 'text', max: 1000 },
        { name: 'greeting_text_closed', type: 'text', max: 1000 },
        { name: 'greeting_approved_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
        { name: 'greeting_approved_at', type: 'date' },
        {
          name: 'greeting_live_authorized_by',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
        },
        { name: 'greeting_live_authorized_at', type: 'date' },
        // telefones de teste (só dígitos), separados por vírgula
        { name: 'greeting_test_phones', type: 'text', max: 500 },
        // plano/contagem de chamadas da conexão fixture (RN-40)
        { name: 'fixture_send_plan', type: 'json', maxSize: 20000 },
        { name: 'fixture_send_calls', type: 'number', onlyInt: true, min: 0 },
      ],
      indexes: ['CREATE INDEX idx_channel_connections_status ON channel_connections (status)'],
    })
    conn.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    conn.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(conn)

    // ---------- 2. conversations ----------
    const connId = app.findCollectionByNameOrId('channel_connections').id
    const contactsId = app.findCollectionByNameOrId('contacts').id
    const oppsId = app.findCollectionByNameOrId('opportunities').id
    const itemsId = app.findCollectionByNameOrId('service_items').id

    const convs = new Collection({
      name: 'conversations',
      type: 'base',
      listRule: inboxRule,
      viewRule: inboxRule,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'connection',
          type: 'relation',
          required: true,
          collectionId: connId,
          maxSelect: 1,
        },
        // contato/oportunidade opcionais: nem toda conversa já tem ficha (revisar vínculo)
        { name: 'contact', type: 'relation', collectionId: contactsId, maxSelect: 1 },
        { name: 'opportunity', type: 'relation', collectionId: oppsId, maxSelect: 1 },
        { name: 'contact_phone', type: 'text', max: 20 },
        { name: 'contact_lid', type: 'text', max: 80 },
        { name: 'contact_name_wa', type: 'text', max: 160 },
        {
          name: 'link_state',
          type: 'select',
          values: ['vinculada', 'revisar', 'sem_telefone', 'historico_sem_contato', 'nao_paciente'],
          required: true,
          maxSelect: 1,
        },
        { name: 'assignee', type: 'relation', collectionId: usersId, maxSelect: 1 },
        { name: 'service_item', type: 'relation', collectionId: itemsId, maxSelect: 1 },
        { name: 'last_inbound_at', type: 'date' },
        { name: 'last_outbound_at', type: 'date' },
        // última mensagem do paciente + 24 h (janela de atendimento)
        { name: 'window_expires_at', type: 'date' },
        { name: 'is_fixture', type: 'bool' },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_conversations_phone ON conversations (connection, contact_phone)',
        'CREATE UNIQUE INDEX idx_conversations_lid ON conversations (connection, contact_lid)',
        'CREATE INDEX idx_conversations_link_state ON conversations (link_state)',
      ],
    })
    convs.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    convs.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(convs)

    // ---------- 3. messages ----------
    const convsId = app.findCollectionByNameOrId('conversations').id
    const msgs = new Collection({
      name: 'messages',
      type: 'base',
      listRule: inboxRule,
      viewRule: inboxRule,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'connection',
          type: 'relation',
          required: true,
          collectionId: connId,
          maxSelect: 1,
        },
        {
          name: 'conversation',
          type: 'relation',
          required: true,
          collectionId: convsId,
          maxSelect: 1,
        },
        // sempre em minúsculas — a D-API manda o id em maiúsculas em messages.sent
        { name: 'wa_message_id', type: 'text', required: true, max: 200 },
        {
          name: 'direction',
          type: 'select',
          values: ['entrada', 'saida'],
          required: true,
          maxSelect: 1,
        },
        {
          name: 'author_kind',
          type: 'select',
          values: ['paciente', 'equipe_celular', 'celular_ou_robo', 'equipe_crm', 'automatico'],
          required: true,
          maxSelect: 1,
        },
        { name: 'author_user', type: 'relation', collectionId: usersId, maxSelect: 1 },
        // veio de "Fui eu" (a equipe declarou que respondeu pelo celular)
        { name: 'author_declared', type: 'bool' },
        { name: 'type', type: 'text', max: 40 },
        { name: 'text', type: 'text', max: 5000 },
        { name: 'media_meta', type: 'json', maxSize: 20000 },
        // OCULTO: nunca sai na API de listagem (ver viewRule/hook de anexo)
        { name: 'media_url', type: 'text', max: 1000, hidden: true },
        { name: 'origin_ts', type: 'date' },
        { name: 'received_at', type: 'date' },
        {
          name: 'status',
          type: 'select',
          values: ['recebida', 'aceita', 'entregue', 'lida', 'falhou'],
          maxSelect: 1,
        },
        { name: 'status_at', type: 'date' },
        { name: 'edited', type: 'bool' },
        { name: 'deleted', type: 'bool' },
        { name: 'from_history', type: 'bool' },
        { name: 'is_fixture', type: 'bool' },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_messages_wa_id ON messages (connection, wa_message_id)',
        'CREATE INDEX idx_messages_conversation ON messages (conversation, origin_ts)',
      ],
    })
    msgs.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    msgs.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(msgs)

    // ---------- 4. provider_event_receipts (log técnico, sem dado de paciente) ----------
    const receipts = new Collection({
      name: 'provider_event_receipts',
      type: 'base',
      listRule: adminRule,
      viewRule: adminRule,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'dedupe_key', type: 'text', required: true, max: 250 },
        { name: 'event', type: 'text', max: 60 },
        { name: 'session_id', type: 'text', max: 120 },
        { name: 'ref_id', type: 'text', max: 200 },
        {
          name: 'result',
          type: 'select',
          values: [
            'gravada',
            'atualizada',
            'duplicado',
            'ignorado_grupo',
            'ignorado_tipo',
            'sessao_desconhecida',
            'sessao_inativa',
            'sessao_vinculada',
            'status_pendente',
            'recusado',
            'erro',
          ],
          maxSelect: 1,
        },
        { name: 'http_status', type: 'number', onlyInt: true },
        { name: 'error_code', type: 'text', max: 80 },
        { name: 'received_at', type: 'date' },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_receipts_dedupe ON provider_event_receipts (dedupe_key)'],
    })
    receipts.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    receipts.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(receipts)

    // ---------- 5. outbound_messages ----------
    const outbound = new Collection({
      name: 'outbound_messages',
      type: 'base',
      listRule: inboxRule,
      viewRule: inboxRule,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'connection',
          type: 'relation',
          required: true,
          collectionId: connId,
          maxSelect: 1,
        },
        {
          name: 'conversation',
          type: 'relation',
          required: true,
          collectionId: convsId,
          maxSelect: 1,
        },
        { name: 'to_phone', type: 'text', max: 20 },
        {
          name: 'kind',
          type: 'select',
          values: ['resposta_humana', 'acolhimento', 'teste'],
          required: true,
          maxSelect: 1,
        },
        { name: 'text', type: 'text', required: true, max: 4096 },
        // por rascunho ou por espera (RN-15) — impede envio duplicado
        { name: 'idempotency_key', type: 'text', required: true, max: 200 },
        { name: 'requested_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
        {
          name: 'state',
          type: 'select',
          values: ['pendente', 'em_envio', 'aceita', 'falhou', 'reconciliar'],
          required: true,
          maxSelect: 1,
        },
        { name: 'fail_reason', type: 'text', max: 300 },
        { name: 'attempts', type: 'number', onlyInt: true, min: 0 },
        { name: 'next_attempt_at', type: 'date' },
        { name: 'last_error', type: 'text', max: 500 },
        { name: 'provider_message_id', type: 'text', max: 200 },
        {
          name: 'message',
          type: 'relation',
          collectionId: app.findCollectionByNameOrId('messages').id,
          maxSelect: 1,
        },
        { name: 'is_fixture', type: 'bool' },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_outbound_idem ON outbound_messages (idempotency_key)',
        'CREATE INDEX idx_outbound_state ON outbound_messages (state)',
      ],
    })
    outbound.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    outbound.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(outbound)

    // ---------- 6. campos novos em service_items ----------
    const items = app.findCollectionByNameOrId('service_items')
    if (!items.fields.getByName('channel')) {
      items.fields.add(
        new SelectField({ name: 'channel', values: ['manual', 'whatsapp'], maxSelect: 1 }),
      )
    }
    if (!items.fields.getByName('conversation')) {
      items.fields.add(
        new RelationField({ name: 'conversation', collectionId: convsId, maxSelect: 1 }),
      )
    }
    if (!items.fields.getByName('wait_started_at')) {
      items.fields.add(new DateField({ name: 'wait_started_at' }))
    }
    if (!items.fields.getByName('first_auto_reply_at')) {
      items.fields.add(new DateField({ name: 'first_auto_reply_at' }))
    }
    if (!items.fields.getByName('first_human_reply_at')) {
      items.fields.add(new DateField({ name: 'first_human_reply_at' }))
    }
    if (!items.fields.getByName('first_human_reply_source')) {
      items.fields.add(
        new SelectField({
          name: 'first_human_reply_source',
          values: ['celular', 'celular_declarado', 'crm'],
          maxSelect: 1,
        }),
      )
    }
    if (!items.fields.getByName('response_measure')) {
      items.fields.add(
        new SelectField({
          name: 'response_measure',
          values: ['real', 'declarada'],
          maxSelect: 1,
        }),
      )
    }
    // itens que já existem continuam como antes: manuais e medidos pelo declarado
    for (const it of app.findAllRecords('service_items')) {
      if (!it.getString('channel')) it.set('channel', 'manual')
      if (!it.getString('response_measure')) it.set('response_measure', 'declarada')
      try {
        app.save(it)
      } catch (_) {}
    }
    app.save(items)

    // ---------- 7. opportunity deixa de ser obrigatória em service_items ----------
    // A conversa do WhatsApp cria item de fila ANTES de existir ficha (revisar vínculo).
    // Itens manuais continuam exigindo oportunidade pela validação do serviço da tela.
    const itemsFinal = app.findCollectionByNameOrId('service_items')
    const oppField = itemsFinal.fields.getByName('opportunity')
    if (oppField) {
      oppField.required = false
      app.save(itemsFinal)
    }
  },
  (app) => {
    // down: remove campos e coleções na ordem inversa das dependências
    try {
      const items = app.findCollectionByNameOrId('service_items')
      for (const f of [
        'channel',
        'conversation',
        'wait_started_at',
        'first_auto_reply_at',
        'first_human_reply_at',
        'first_human_reply_source',
        'response_measure',
      ]) {
        if (items.fields.getByName(f)) items.fields.removeByName(f)
      }
      const oppField = items.fields.getByName('opportunity')
      if (oppField) oppField.required = true
      app.save(items)
    } catch (_) {}
    for (const name of [
      'outbound_messages',
      'provider_event_receipts',
      'messages',
      'conversations',
      'channel_connections',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
