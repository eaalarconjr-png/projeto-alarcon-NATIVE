// task AL-F2-04: agenda clínica e eventos confirmados pela equipe (lançamento manual).
// Solicitação não é confirmação; remarcação cancela a data operacional anterior preservando
// o histórico (registro antigo vira "remarcado" e aponta para o novo); consulta realizada,
// cirurgia realizada, alta e resultado comercial são eventos distintos com autor e data.
// Nenhum score aciona resultado comercial; nada programa disparos nesta fase.
migrate(
  (app) => {
    const fichaRule = "@request.auth.id != '' && @request.auth.role != 'gestor_trafego'"
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"

    const opportunitiesId = app.findCollectionByNameOrId('opportunities').id
    const usersId = '_pb_users_auth_'

    const events = new Collection({
      name: 'agenda_events',
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
        {
          name: 'type',
          type: 'select',
          values: ['consulta', 'cirurgia', 'alta', 'resultado_comercial'],
          required: true,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          values: ['solicitado', 'confirmado', 'remarcado', 'cancelado', 'realizado'],
          required: true,
          maxSelect: 1,
        },
        { name: 'event_at', type: 'date', required: true },
        { name: 'source', type: 'text', max: 200 },
        { name: 'note', type: 'text', max: 500 },
        {
          name: 'registered_by',
          type: 'relation',
          required: true,
          collectionId: usersId,
          maxSelect: 1,
        },
        {
          name: 'confirmed_by',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
        },
      ],
      indexes: [
        'CREATE INDEX idx_agenda_events_opportunity ON agenda_events (opportunity)',
        'CREATE INDEX idx_agenda_events_status ON agenda_events (status)',
      ],
    })
    events.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    events.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(events)

    // autorreferência (remarcação) só depois da coleção existir
    const saved = app.findCollectionByNameOrId('agenda_events')
    saved.fields.add(new RelationField({ name: 'replaces', collectionId: saved.id, maxSelect: 1 }))
    app.save(saved)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('agenda_events'))
    } catch (_) {}
  },
)
