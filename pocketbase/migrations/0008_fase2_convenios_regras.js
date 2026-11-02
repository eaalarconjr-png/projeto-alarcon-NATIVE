// task AL-F2-01: convênios/planos com caminho aplicável + regras de qualificação versionadas.
// Regra da clínica (decisão 26/10): Porto Seguro credenciada; demais = reembolso ou particular.
// O score fica inativo até existir versão ativa aprovada pelo administrador (SPEC AL-F2).
migrate(
  (app) => {
    const fichaRule = "@request.auth.id != '' && @request.auth.role != 'gestor_trafego'"
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"

    // 1. insurance_plans — cadastro de convênios/planos e o caminho de atendimento de cada um
    const plans = new Collection({
      name: 'insurance_plans',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: fichaRule,
      updateRule: fichaRule,
      deleteRule: adminRule,
      fields: [
        { name: 'name', type: 'text', required: true, min: 2, max: 120 },
        {
          name: 'path',
          type: 'select',
          values: ['credenciado', 'reembolso', 'particular', 'revisao'],
          required: true,
          maxSelect: 1,
        },
        { name: 'notes', type: 'text', max: 500 },
      ],
      indexes: ['CREATE INDEX idx_insurance_plans_name ON insurance_plans (name)'],
    })
    plans.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    plans.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(plans)

    // 2. qualification_rule_versions — critérios versionados; ativação registra aprovador e data
    const rules = new Collection({
      name: 'qualification_rule_versions',
      type: 'base',
      listRule: fichaRule,
      viewRule: fichaRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        { name: 'version_number', type: 'number', required: true, onlyInt: true, min: 1 },
        {
          name: 'status',
          type: 'select',
          values: ['rascunho', 'ativo', 'arquivado'],
          required: true,
          maxSelect: 1,
        },
        { name: 'criteria', type: 'json', required: true, maxSize: 20000 },
        { name: 'notes', type: 'text', max: 1000 },
        {
          name: 'approved_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'approved_at', type: 'date' },
      ],
      indexes: ['CREATE INDEX idx_qrv_status ON qualification_rule_versions (status)'],
    })
    rules.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    rules.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(rules)

    // 3. seed idempotente: Porto Seguro como credenciada (decisão do Dr. Ernesto, 26/10/2026)
    const seeded = app.findRecordsByFilter('insurance_plans', 'name = {:n}', '', 1, 0, {
      n: 'Porto Seguro',
    })
    if (seeded.length === 0) {
      const rec = new Record(app.findCollectionByNameOrId('insurance_plans'))
      rec.set('name', 'Porto Seguro')
      rec.set('path', 'credenciado')
      rec.set('notes', 'Operadora credenciada — decisão do Dr. Ernesto em 26/10/2026.')
      app.save(rec)
    }
  },
  (app) => {
    for (const name of ['qualification_rule_versions', 'insurance_plans']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
