// Pedido do Dr. Ernesto (28/10): as réguas de alerta distinguem paciente CIRÚRGICO de CLÍNICO
// ("cirúrgico particular 3 min" x "clínico particular 3 min" x "clínico Porto 40 min").
// A oportunidade só sabia a modalidade (particular/convênio/reembolso), não o tipo de cuidado.
// Migration aditiva: cria care_type e preenche o que já existe a partir do interesse/respostas.
migrate(
  (app) => {
    const opportunities = app.findCollectionByNameOrId('opportunities')
    if (!opportunities.fields.getByName('care_type')) {
      opportunities.fields.add(
        new SelectField({
          name: 'care_type',
          values: ['cirurgico', 'clinico'],
          maxSelect: 1,
        }),
      )
    }
    app.save(opportunities)

    // Retroativo: infere pelo texto do interesse e pelas respostas do formulário.
    // Sem sinal claro, fica vazio (ausente ≠ chute): a régua não julga o que não sabe.
    const cirurgicos = [
      'cirurgia',
      'cirurgico',
      'cirúrgico',
      'vesicula',
      'vesícula',
      'hernia',
      'hérnia',
      'lipoma',
      'vasectomia',
      'postectomia',
      'colecistectomia',
      'videolaparoscopia',
    ]
    for (const op of app.findAllRecords('opportunities')) {
      if (op.getString('care_type')) continue
      const interest = String(op.getString('interest') || '').toLowerCase()
      let decided = ''
      for (const word of cirurgicos) {
        if (interest.indexOf(word) >= 0) {
          decided = 'cirurgico'
          break
        }
      }
      if (!decided) {
        // tenta as respostas de formulário da própria oportunidade
        let subs = []
        try {
          subs = app.findRecordsByFilter('submissions', 'opportunity = {:o}', '-created', 20, 0, {
            o: op.id,
          })
        } catch (_) {}
        for (const sub of subs) {
          let answers = {}
          try {
            answers = JSON.parse(sub.getString('answers') || '{}')
          } catch (_) {}
          for (const key of Object.keys(answers)) {
            const val = String(answers[key] || '').toLowerCase()
            if (val.indexOf('cirurgia') >= 0) decided = 'cirurgico'
            else if (val.indexOf('consulta') >= 0 && !decided) decided = 'clinico'
          }
        }
      }
      if (decided) {
        op.set('care_type', decided)
        app.save(op)
      }
    }
  },
  (app) => {
    try {
      const opportunities = app.findCollectionByNameOrId('opportunities')
      if (opportunities.fields.getByName('care_type')) {
        opportunities.fields.removeByName('care_type')
      }
      app.save(opportunities)
    } catch (_) {}
  },
)
