// task AL-F1-01: papéis da equipe + coleções da ficha (contatos, oportunidades, histórico de etapa)
// Migration aditiva: cria coleções novas e acrescenta o campo role em users.
migrate(
  (app) => {
    // 1. users: campo role + bloqueio de auto-alteração do papel
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          values: ['admin', 'atendimento', 'gestor_trafego'],
          maxSelect: 1,
          required: true,
        }),
      )
    }
    // O papel decide permissões: o usuário não pode alterar o próprio papel pela API.
    users.updateRule = 'id = @request.auth.id && @request.body.role:changed = false'
    app.save(users)

    // Regra comum das fichas: autenticado e NÃO gestor de tráfego.
    const fichaRule = "@request.auth.id != '' && @request.auth.role != 'gestor_trafego'"

    // 2. contacts — pessoa/contato mínimo (SPEC AL-F1: nome, telefone normalizado, e-mail opcional)
    const contacts = new Collection({
      name: 'contacts',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: fichaRule,
      updateRule: fichaRule,
      deleteRule: fichaRule,
      fields: [
        { name: 'name', type: 'text', required: true, min: 2, max: 120 },
        // apenas dígitos (normalização na camada de serviço)
        { name: 'phone', type: 'text', required: true, min: 10, max: 13 },
        { name: 'email', type: 'email' },
        {
          name: 'source_declared',
          type: 'select',
          values: ['whatsapp', 'site', 'indicacao', 'convenio_app', 'outro'],
          maxSelect: 1,
        },
      ],
      indexes: [
        // NÃO único: telefone compartilhado é caso real e pede revisão humana, não bloqueio
        'CREATE INDEX idx_contacts_phone ON contacts (phone)',
      ],
    })
    app.save(contacts)

    // 3. opportunities — pessoa é diferente de oportunidade (uma pessoa, várias jornadas)
    const contactsId = app.findCollectionByNameOrId('contacts').id
    const opportunities = new Collection({
      name: 'opportunities',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: fichaRule,
      updateRule: fichaRule,
      deleteRule: fichaRule,
      fields: [
        {
          name: 'contact',
          type: 'relation',
          required: true,
          collectionId: contactsId,
          maxSelect: 1,
        },
        { name: 'interest', type: 'text', required: true, max: 200 },
        {
          name: 'modality',
          type: 'select',
          values: ['particular', 'convenio', 'reembolso'],
          maxSelect: 1,
        },
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        {
          name: 'stage',
          type: 'select',
          values: [
            'novo',
            'em_atendimento',
            'agendamento_solicitado',
            'consulta_confirmada',
            'em_acompanhamento',
            'encerrado',
          ],
          required: true,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          values: ['aberta', 'encerrada'],
          required: true,
          maxSelect: 1,
        },
        { name: 'close_reason', type: 'text', max: 500 },
        { name: 'next_step', type: 'text', max: 300 },
        { name: 'next_step_at', type: 'date' },
        {
          name: 'origin_declared',
          type: 'select',
          values: ['whatsapp', 'site', 'indicacao', 'convenio_app', 'outro', 'nao_identificado'],
          maxSelect: 1,
        },
        { name: 'origin_captured', type: 'text', max: 500 },
      ],
      indexes: [
        'CREATE INDEX idx_opportunities_stage ON opportunities (stage)',
        'CREATE INDEX idx_opportunities_owner ON opportunities (owner)',
        'CREATE INDEX idx_opportunities_contact ON opportunities (contact)',
      ],
    })
    app.save(opportunities)

    // 4. stage_history — movimentação auditada (autor e data em cada mudança de etapa)
    const opportunitiesId = app.findCollectionByNameOrId('opportunities').id
    const stageHistory = new Collection({
      name: 'stage_history',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: fichaRule,
      updateRule: fichaRule,
      deleteRule: fichaRule,
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
          name: 'from_stage',
          type: 'select',
          values: [
            'novo',
            'em_atendimento',
            'agendamento_solicitado',
            'consulta_confirmada',
            'em_acompanhamento',
            'encerrado',
          ],
          maxSelect: 1,
        },
        {
          name: 'to_stage',
          type: 'select',
          values: [
            'novo',
            'em_atendimento',
            'agendamento_solicitado',
            'consulta_confirmada',
            'em_acompanhamento',
            'encerrado',
          ],
          required: true,
          maxSelect: 1,
        },
        {
          name: 'author',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'note', type: 'text', max: 500 },
      ],
      indexes: ['CREATE INDEX idx_stage_history_opportunity ON stage_history (opportunity)'],
    })
    app.save(stageHistory)
  },
  (app) => {
    // down: remove na ordem inversa de dependência e devolve users ao estado anterior
    for (const name of ['stage_history', 'opportunities', 'contacts']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      users.updateRule = 'id = @request.auth.id'
      const role = users.fields.getByName('role')
      if (role) {
        users.fields.removeByName('role')
      }
      app.save(users)
    } catch (_) {}
  },
)
