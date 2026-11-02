// Pedido do Dr. Ernesto (27/10, 18:32): vários perfis de paciente ATIVOS AO MESMO TEMPO,
// cada um com um peso estratégico, para o sistema dizer qual perfil é o mais pretendido pela
// clínica (e o menos) e orientar a captação em redes sociais e Google.
// Migration aditiva: acrescenta nome do perfil e peso estratégico à coleção de regras; guarda
// no resultado da avaliação o comparativo de todos os perfis ativos.
migrate(
  (app) => {
    // 1. qualification_rule_versions passa a representar PERFIS de paciente
    const rules = app.findCollectionByNameOrId('qualification_rule_versions')
    if (!rules.fields.getByName('profile_name')) {
      rules.fields.add(new TextField({ name: 'profile_name', max: 120 }))
    }
    if (!rules.fields.getByName('strategic_weight')) {
      rules.fields.add(
        new NumberField({ name: 'strategic_weight', onlyInt: true, min: 1, max: 1000 }),
      )
    }
    if (!rules.fields.getByName('target_notes')) {
      rules.fields.add(new TextField({ name: 'target_notes', max: 1000 }))
    }
    app.save(rules)

    // 2. retroativo: a regra que já existe vira o primeiro perfil, com peso neutro
    for (const r of app.findAllRecords('qualification_rule_versions')) {
      if (!r.getString('profile_name')) {
        r.set('profile_name', 'Perfil ' + r.getInt('version_number') + ' (padrão)')
      }
      if (!r.get('strategic_weight')) {
        r.set('strategic_weight', 10)
      }
      app.save(r)
    }

    // 3. a avaliação passa a guardar o comparativo entre todos os perfis ativos
    const quals = app.findCollectionByNameOrId('qualifications')
    if (!quals.fields.getByName('results')) {
      quals.fields.add(new JSONField({ name: 'results', maxSize: 60000 }))
    }
    if (!quals.fields.getByName('best_profile_name')) {
      quals.fields.add(new TextField({ name: 'best_profile_name', max: 120 }))
    }
    if (!quals.fields.getByName('fit_pct')) {
      quals.fields.add(new NumberField({ name: 'fit_pct', onlyInt: true, min: 0, max: 100 }))
    }
    app.save(quals)
  },
  (app) => {
    try {
      const rules = app.findCollectionByNameOrId('qualification_rule_versions')
      for (const n of ['profile_name', 'strategic_weight', 'target_notes']) {
        if (rules.fields.getByName(n)) rules.fields.removeByName(n)
      }
      app.save(rules)
    } catch (_) {}
    try {
      const quals = app.findCollectionByNameOrId('qualifications')
      for (const n of ['results', 'best_profile_name', 'fit_pct']) {
        if (quals.fields.getByName(n)) quals.fields.removeByName(n)
      }
      app.save(quals)
    } catch (_) {}
  },
)
