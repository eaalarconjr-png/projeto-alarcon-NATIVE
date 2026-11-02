// task AL-F2-02: avaliações de qualificação explicáveis e imutáveis.
// Cada avaliação guarda versão da regra, nota, estado (completa/incompleta/nao_configurada),
// explicação por critério, autor e data. Recalcular cria um registro novo — o anterior fica.
// Criação só pela rota do servidor (createRule nula); exclusão só pelo admin para correção.
migrate(
  (app) => {
    const fichaRule = "@request.auth.id != '' && @request.auth.role != 'gestor_trafego'"
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"

    const opportunitiesId = app.findCollectionByNameOrId('opportunities').id
    const rulesId = app.findCollectionByNameOrId('qualification_rule_versions').id

    const quals = new Collection({
      name: 'qualifications',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: null,
      updateRule: null,
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
          name: 'rule_version',
          type: 'relation',
          required: true,
          collectionId: rulesId,
          maxSelect: 1,
        },
        {
          name: 'state',
          type: 'select',
          values: ['completa', 'incompleta', 'nao_configurada'],
          required: true,
          maxSelect: 1,
        },
        { name: 'score', type: 'number', onlyInt: true },
        { name: 'explanation', type: 'json', required: true, maxSize: 20000 },
        {
          name: 'evaluated_by',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
      ],
      indexes: ['CREATE INDEX idx_qualifications_opportunity ON qualifications (opportunity)'],
    })
    quals.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    quals.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(quals)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('qualifications'))
    } catch (_) {}
  },
)
