// task AL-F1-03/04 (decisão do cliente 26/10): configuração da clínica editável.
// Etapas do funil com nomes editáveis; operadoras credenciadas (hoje: Porto Seguro).
// Demais operadoras/seguradoras são atendidas por reembolso ou particular — regra usada
// pelo criador de formulários (AL-F1-04) e pela qualificação (fase 2).
migrate(
  (app) => {
    const fichaRule = "@request.auth.id != '' && @request.auth.role != 'gestor_trafego'"
    const adminOnly = "@request.auth.role = 'admin'"
    const settings = new Collection({
      name: 'clinic_settings',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: adminOnly,
      updateRule: adminOnly,
      deleteRule: adminOnly,
      fields: [
        { name: 'settings_key', type: 'text', required: true, max: 20 },
        { name: 'stage_labels', type: 'json', maxSize: 2000 },
        { name: 'credentialed_operators', type: 'json', maxSize: 2000 },
        { name: 'updated_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_clinic_settings_key ON clinic_settings (settings_key)'],
    })
    app.save(settings)
    // seed idempotente do registro único
    try {
      app.findFirstRecordByFilter('clinic_settings', "settings_key = 'main'")
    } catch (_) {
      const record = new Record(settings)
      record.set('settings_key', 'main')
      record.set(
        'stage_labels',
        JSON.stringify({
          novo: 'Novo',
          em_atendimento: 'Em atendimento',
          agendamento_solicitado: 'Agendamento solicitado',
          consulta_confirmada: 'Consulta confirmada',
          em_acompanhamento: 'Em acompanhamento',
          encerrado: 'Encerrado',
        }),
      )
      record.set('credentialed_operators', JSON.stringify(['Porto Seguro']))
      app.save(record)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('clinic_settings'))
    } catch (_) {}
  },
)
