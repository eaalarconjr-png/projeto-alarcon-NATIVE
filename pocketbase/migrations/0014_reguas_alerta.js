// Pedido do Dr. Ernesto (28/10, 16:50): réguas de alerta EDITÁVEIS e ampliáveis.
// Em vez de prazos fixos no código, cada régua é um registro que ele cria, edita e remove.
// Uma régua diz: quando dispara (tempo sem interação, antecedência de consulta, tempo desde
// atendimento ou desde a última passagem), para quais perfis de paciente, com qual prioridade
// e qual a ação esperada da equipe. O cron lê estas réguas a cada minuto.
migrate(
  (app) => {
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const teamRule = "@request.auth.id != ''"

    const rules = new Collection({
      name: 'alert_rules',
      type: 'base',
      listRule: teamRule,
      viewRule: teamRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        { name: 'name', type: 'text', required: true, min: 3, max: 120 },
        {
          name: 'kind',
          type: 'select',
          values: ['sem_interacao', 'antes_consulta', 'pos_atendimento', 'retorno'],
          required: true,
          maxSelect: 1,
        },
        { name: 'threshold_minutes', type: 'number', onlyInt: true, min: 1 },
        {
          name: 'priority',
          type: 'select',
          values: ['urgente', 'alta', 'normal', 'baixa'],
          required: true,
          maxSelect: 1,
        },
        {
          name: 'applies_to',
          type: 'select',
          values: [
            'particular',
            'convenio',
            'reembolso',
            'clinico_particular',
            'clinico_porto',
            'todos',
          ],
          required: true,
          maxSelect: 1,
        },
        { name: 'action_hint', type: 'text', max: 300 },
        { name: 'active', type: 'bool' },
        { name: 'notes', type: 'text', max: 500 },
      ],
      indexes: ['CREATE INDEX idx_alert_rules_active ON alert_rules (active)'],
    })
    rules.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    rules.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(rules)

    // Sementes: exatamente as réguas descritas pelo Dr. em 28/10.
    const seed = [
      {
        name: 'Primeira resposta em 30 segundos',
        kind: 'sem_interacao',
        threshold_minutes: 1,
        priority: 'urgente',
        applies_to: 'todos',
        action_hint: 'Responder o novo lead imediatamente. Atendimento inicial por IA.',
        notes: 'Novo lead recebe primeira interação automática em até 30 segundos.',
      },
      {
        name: 'Cirúrgico particular/reembolso/convênio sem resposta · 3 min',
        kind: 'sem_interacao',
        threshold_minutes: 3,
        priority: 'urgente',
        applies_to: 'particular',
        action_hint: 'Ligar agora. Paciente cirúrgico de alto valor sem interação.',
        notes: 'Alerta a cada 3 min sem interação da nossa parte.',
      },
      {
        name: 'Clínico particular sem resposta · 3 min',
        kind: 'sem_interacao',
        threshold_minutes: 3,
        priority: 'urgente',
        applies_to: 'clinico_particular',
        action_hint: 'Ligar agora. Paciente clínico particular sem interação.',
        notes: 'Prioridade de resposta imediata.',
      },
      {
        name: 'Cirúrgico convênio sem resposta · 3 min',
        kind: 'sem_interacao',
        threshold_minutes: 3,
        priority: 'urgente',
        applies_to: 'convenio',
        action_hint: 'Ligar agora. Paciente cirúrgico de convênio sem interação.',
        notes: 'Pedido do Dr.: cirúrgico de convênio tem prioridade de resposta imediata.',
      },
      {
        name: 'Clínico Porto Saúde sem resposta · 40 min',
        kind: 'sem_interacao',
        threshold_minutes: 40,
        priority: 'alta',
        applies_to: 'clinico_porto',
        action_hint: 'Retornar o contato do paciente Porto Saúde.',
        notes: 'Alerta acima de 40 minutos sem resposta.',
      },
      {
        name: 'Confirmar consulta 48h antes',
        kind: 'antes_consulta',
        threshold_minutes: 2880,
        priority: 'alta',
        applies_to: 'todos',
        action_hint: 'Confirmar presença e orientar preparo.',
        notes: 'Consulta marcada em 48 a 72 horas.',
      },
      {
        name: 'Feedback pós-atendimento · 1 dia',
        kind: 'pos_atendimento',
        threshold_minutes: 1440,
        priority: 'normal',
        applies_to: 'todos',
        action_hint: 'Contatar para saber como foi a experiência.',
        notes: 'Interação em até 1 dia após o atendimento.',
      },
      {
        name: 'Cirúrgico sem retorno após consulta · 3 meses',
        kind: 'retorno',
        threshold_minutes: 129600,
        priority: 'alta',
        applies_to: 'particular',
        action_hint: 'Reagendar: passou em consulta cirúrgica e não voltou.',
        notes: 'Interação para reagendamento 3 meses após a consulta.',
      },
      {
        name: 'Reativação · 6 meses sem passar na clínica',
        kind: 'retorno',
        threshold_minutes: 259200,
        priority: 'normal',
        applies_to: 'todos',
        action_hint: 'Contatar para nova consulta de acompanhamento.',
        notes: 'Pacientes com mais de 6 meses da última passagem na clínica.',
      },
    ]
    for (const r of seed) {
      const exists = app.findRecordsByFilter('alert_rules', 'name = {:n}', '', 1, 0, { n: r.name })
      if (exists.length === 0) {
        const rec = new Record(rules)
        rec.set('name', r.name)
        rec.set('kind', r.kind)
        rec.set('threshold_minutes', r.threshold_minutes)
        rec.set('priority', r.priority)
        rec.set('applies_to', r.applies_to)
        rec.set('action_hint', r.action_hint)
        rec.set('notes', r.notes)
        rec.set('active', true)
        app.save(rec)
      }
    }

    // O alerta registra a régua que o gerou e a chave de deduplicação
    const alerts = app.findCollectionByNameOrId('internal_alerts')
    if (!alerts.fields.getByName('rule')) {
      alerts.fields.add(new RelationField({ name: 'rule', collectionId: rules.id, maxSelect: 1 }))
    }
    if (!alerts.fields.getByName('due_at')) {
      alerts.fields.add(new DateField({ name: 'due_at' }))
    }
    if (!alerts.fields.getByName('dedupe_key')) {
      alerts.fields.add(new TextField({ name: 'dedupe_key', max: 200 }))
    }
    // Nem todo alerta nasce de um item de fila (consulta, feedback, reativação)
    const itemField = alerts.fields.getByName('item')
    if (itemField) itemField.required = false
    app.save(alerts)
  },
  (app) => {
    try {
      const alerts = app.findCollectionByNameOrId('internal_alerts')
      for (const f of ['rule', 'due_at', 'dedupe_key']) {
        if (alerts.fields.getByName(f)) alerts.fields.removeByName(f)
      }
      app.save(alerts)
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('alert_rules'))
    } catch (_) {}
  },
)
