// task AL-F1-05: submissões — respostas ligadas à versão preenchida, idempotência por chave.
// Regras públicas: nenhuma (a rota aberta é o hook /backend/v1/formularios/{versionId}/respostas,
// que valida tudo no servidor). A equipe lê as respostas pela ficha.
migrate(
  (app) => {
    const fichaRule = "@request.auth.id != '' && @request.auth.role != 'gestor_trafego'"
    const formVersionsId = app.findCollectionByNameOrId('form_versions').id
    const opportunitiesId = app.findCollectionByNameOrId('opportunities').id
    const submissions = new Collection({
      name: 'submissions',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'form_version',
          type: 'relation',
          required: true,
          collectionId: formVersionsId,
          maxSelect: 1,
        },
        { name: 'submission_key', type: 'text', required: true, min: 8, max: 100 },
        { name: 'answers', type: 'json', required: true, maxSize: 20000 },
        {
          name: 'origin_declared',
          type: 'select',
          values: ['whatsapp', 'site', 'indicacao', 'convenio_app', 'outro', 'nao_identificado'],
          maxSelect: 1,
        },
        { name: 'origin_captured', type: 'text', max: 500 },
        {
          name: 'opportunity',
          type: 'relation',
          required: true,
          collectionId: opportunitiesId,
          maxSelect: 1,
        },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_submissions_key ON submissions (submission_key)'],
    })
    app.save(submissions)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('submissions'))
    } catch (_) {}
  },
)
