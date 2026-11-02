// AL-F3-01/02: base do painel e da importação de mídia.
// Decisões do Dr. (28/10): canais Google Ads, Meta Ads e Instagram; orçamento por canal e CPA
// alvo por perfil VARIÁVEIS e definidos depois — entram como campos vazios, nunca inventados.
// Nada aqui recebe dado de paciente: mídia é gasto e métrica agregada por conta/campanha/dia.
migrate(
  (app) => {
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const teamRule = "@request.auth.id != ''"

    // 1. media_daily — uma linha por plataforma + conta + campanha + dia.
    //    O índice único é a garantia de idempotência da importação: reimportar não dobra gasto.
    const media = new Collection({
      name: 'media_daily',
      type: 'base',
      listRule: teamRule,
      viewRule: teamRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        {
          name: 'platform',
          type: 'select',
          values: ['google', 'meta', 'instagram', 'outro'],
          required: true,
          maxSelect: 1,
        },
        { name: 'account_id', type: 'text', required: true, max: 120 },
        { name: 'account_name', type: 'text', max: 160 },
        // ID técnico da campanha (não é o nome editável na plataforma)
        { name: 'campaign_id', type: 'text', required: true, max: 120 },
        { name: 'campaign_name', type: 'text', max: 200 },
        { name: 'day', type: 'date', required: true },
        { name: 'currency', type: 'text', required: true, max: 3 },
        // Investimento em centavos evita erro de ponto flutuante em soma de dinheiro
        { name: 'spend_cents', type: 'number', onlyInt: true, min: 0 },
        { name: 'impressions', type: 'number', onlyInt: true, min: 0 },
        { name: 'clicks', type: 'number', onlyInt: true, min: 0 },
        { name: 'platform_leads', type: 'number', onlyInt: true, min: 0 },
        {
          name: 'source_kind',
          type: 'select',
          values: ['import', 'api'],
          required: true,
          maxSelect: 1,
        },
        { name: 'import_batch', type: 'text', max: 60 },
      ],
      indexes: [
        // idempotência: mesma plataforma+conta+campanha+dia+origem = um único registro
        'CREATE UNIQUE INDEX idx_media_daily_key ON media_daily (platform, account_id, campaign_id, day, source_kind)',
        'CREATE INDEX idx_media_daily_day ON media_daily (day)',
      ],
    })
    media.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    media.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(media)

    // 2. media_imports — o lote: quem importou, quando, quantas linhas aceitas/rejeitadas.
    const imports = new Collection({
      name: 'media_imports',
      type: 'base',
      listRule: teamRule,
      viewRule: teamRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        { name: 'filename', type: 'text', max: 200 },
        { name: 'platform', type: 'text', max: 40 },
        { name: 'period_start', type: 'date' },
        { name: 'period_end', type: 'date' },
        { name: 'currency', type: 'text', max: 3 },
        { name: 'rows_total', type: 'number', onlyInt: true },
        { name: 'rows_accepted', type: 'number', onlyInt: true },
        { name: 'rows_rejected', type: 'number', onlyInt: true },
        { name: 'rejected_sample', type: 'json', maxSize: 20000 },
        { name: 'imported_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'notes', type: 'text', max: 500 },
      ],
    })
    imports.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    imports.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(imports)

    // 3. channel_targets — orçamento por canal, VAZIO por padrão (decisão do Dr.)
    const targets = new Collection({
      name: 'channel_targets',
      type: 'base',
      listRule: teamRule,
      viewRule: teamRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        {
          name: 'platform',
          type: 'select',
          values: ['google', 'meta', 'instagram', 'outro'],
          required: true,
          maxSelect: 1,
        },
        // vazio = não definido. Nunca preencher por suposição.
        { name: 'monthly_budget_cents', type: 'number', onlyInt: true, min: 0 },
        { name: 'currency', type: 'text', max: 3 },
        { name: 'notes', type: 'text', max: 400 },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_channel_targets_platform ON channel_targets (platform)'],
    })
    targets.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    targets.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    app.save(targets)

    // Sementes dos três canais do escopo, com orçamento vazio
    for (const p of ['google', 'meta', 'instagram']) {
      const exists = app.findRecordsByFilter('channel_targets', 'platform = {:p}', '', 1, 0, { p })
      if (exists.length === 0) {
        const rec = new Record(targets)
        rec.set('platform', p)
        rec.set('currency', 'BRL')
        rec.set('notes', 'Orçamento a definir conforme monitoramento (decisão do Dr. 28/10).')
        app.save(rec)
      }
    }

    // 4. CPA alvo por perfil — vazio e editável em cada perfil de paciente
    const rules = app.findCollectionByNameOrId('qualification_rule_versions')
    if (!rules.fields.getByName('cpa_target_cents')) {
      rules.fields.add(new NumberField({ name: 'cpa_target_cents', onlyInt: true, min: 0 }))
      app.save(rules)
    }
  },
  (app) => {
    for (const name of ['channel_targets', 'media_imports', 'media_daily']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    try {
      const rules = app.findCollectionByNameOrId('qualification_rule_versions')
      if (rules.fields.getByName('cpa_target_cents')) {
        rules.fields.removeByName('cpa_target_cents')
      }
      app.save(rules)
    } catch (_) {}
  },
)
