// task AL-F1-04: formulários com ramificação e versionamento.
// forms: cadastro/título; form_versions: esquema imutável por versão (JSON) + status;
// submissions entra na AL-F1-05 (captura).
// Regra de salto: resposta igual a alternativa -> próxima pergunta ou encerramento.
// Regra da clínica (decisão 26/10): Porto Seguro credenciada; demais = reembolso/particular.
migrate(
  (app) => {
    const fichaRule = "@request.auth.id != '' && @request.auth.role != 'gestor_trafego'"
    const forms = new Collection({
      name: 'forms',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: fichaRule,
      updateRule: fichaRule,
      deleteRule: fichaRule,
      fields: [
        { name: 'title', type: 'text', required: true, min: 3, max: 120 },
        {
          name: 'status',
          type: 'select',
          values: ['rascunho', 'publicado', 'desativado'],
          required: true,
          maxSelect: 1,
        },
      ],
      indexes: [],
    })
    app.save(forms)

    const formsId = app.findCollectionByNameOrId('forms').id
    const formVersions = new Collection({
      name: 'form_versions',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: fichaRule,
      updateRule: fichaRule,
      deleteRule: fichaRule,
      fields: [
        { name: 'form', type: 'relation', required: true, collectionId: formsId, maxSelect: 1 },
        { name: 'version_number', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'schema', type: 'json', required: true, maxSize: 20000 },
        {
          name: 'status',
          type: 'select',
          values: ['rascunho', 'publicada', 'desativada'],
          required: true,
          maxSelect: 1,
        },
        { name: 'published_at', type: 'date' },
        {
          name: 'published_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
      ],
      indexes: ['CREATE INDEX idx_form_versions_form ON form_versions (form)'],
    })
    app.save(formVersions)
  },
  (app) => {
    for (const name of ['form_versions', 'forms']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
