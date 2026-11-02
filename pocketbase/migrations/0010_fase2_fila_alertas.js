// task AL-F2-03: fila humana (service_items) e alertas internos (internal_alerts).
// Assumir item não é evidência de resposta ao paciente: a primeira ação no CRM e a primeira
// resposta humana declarada ficam em campos separados (SPEC AL-F2). Alertas são internos ao
// aplicativo nesta fase — nada vai para o WhatsApp antes da fase 4.
migrate(
  (app) => {
    const fichaRule = "@request.auth.id != '' && @request.auth.role != 'gestor_trafego'"
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"

    const opportunitiesId = app.findCollectionByNameOrId('opportunities').id
    const usersId = '_pb_users_auth_'

    // 1. service_items — um item de fila por ação humana pendente
    const items = new Collection({
      name: 'service_items',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: fichaRule,
      updateRule: fichaRule,
      deleteRule: adminRule,
      fields: [
        {
          name: 'opportunity',
          type: 'relation',
          required: true,
          collectionId: opportunitiesId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'title', type: 'text', required: true, min: 3, max: 200 },
        { name: 'assignee', type: 'relation', collectionId: usersId, maxSelect: 1 },
        { name: 'next_action', type: 'text', max: 300 },
        { name: 'deadline_at', type: 'date' },
        {
          name: 'status',
          type: 'select',
          values: ['pendente', 'em_andamento', 'concluido', 'cancelado'],
          required: true,
          maxSelect: 1,
        },
        { name: 'waiting_human', type: 'bool' },
        { name: 'first_action_at', type: 'date' },
        { name: 'first_human_response_at', type: 'date' },
        { name: 'first_human_response_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
        { name: 'last_activity_at', type: 'date' },
      ],
      indexes: [
        'CREATE INDEX idx_service_items_status ON service_items (status)',
        'CREATE INDEX idx_service_items_opportunity ON service_items (opportunity)',
      ],
    })
    items.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    items.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(items)

    // 2. internal_alerts — alerta interno com destinatário e reconhecimento; dedupe por item+violação
    const itemsId = app.findCollectionByNameOrId('service_items').id
    const alerts = new Collection({
      name: 'internal_alerts',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: null,
      updateRule: fichaRule,
      deleteRule: adminRule,
      fields: [
        {
          name: 'item',
          type: 'relation',
          required: true,
          collectionId: itemsId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'violation', type: 'text', required: true, max: 100 },
        { name: 'message', type: 'text', required: true, max: 500 },
        { name: 'recipient', type: 'relation', collectionId: usersId, maxSelect: 1 },
        { name: 'acknowledged_at', type: 'date' },
        { name: 'acknowledged_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
      ],
      indexes: ['CREATE INDEX idx_internal_alerts_item ON internal_alerts (item)'],
    })
    alerts.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    alerts.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(alerts)

    // 3. clinic_settings: horário de funcionamento, prazo útil e destinatário dos alertas
    // (campos em coleção existente exigem construtores tipados)
    const settings = app.findCollectionByNameOrId('clinic_settings')
    if (!settings.fields.getByName('business_hours_start')) {
      settings.fields.add(new TextField({ name: 'business_hours_start', max: 5 }))
    }
    if (!settings.fields.getByName('business_hours_end')) {
      settings.fields.add(new TextField({ name: 'business_hours_end', max: 5 }))
    }
    if (!settings.fields.getByName('sla_minutes')) {
      settings.fields.add(new NumberField({ name: 'sla_minutes', onlyInt: true }))
    }
    if (!settings.fields.getByName('alert_recipient')) {
      settings.fields.add(
        new RelationField({ name: 'alert_recipient', collectionId: usersId, maxSelect: 1 }),
      )
    }
    app.save(settings)
  },
  (app) => {
    for (const name of ['internal_alerts', 'service_items']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    try {
      const settings = app.findCollectionByNameOrId('clinic_settings')
      for (const f of [
        'business_hours_start',
        'business_hours_end',
        'sla_minutes',
        'alert_recipient',
      ]) {
        const field = settings.fields.getByName(f)
        if (field) settings.fields.removeByName(f)
      }
      app.save(settings)
    } catch (_) {}
  },
)
