// correção do teste da fase 1: as coleções criadas nas tasks ficaram sem os campos
// automáticos created/updated, e toda listagem que ordena por eles falhava.
// Migration aditiva: acrescenta os dois autodate em cada coleção que não os tem.
migrate(
  (app) => {
    const names = [
      'contacts',
      'opportunities',
      'stage_history',
      'forms',
      'form_versions',
      'submissions',
      'clinic_settings',
    ]
    for (const name of names) {
      const col = app.findCollectionByNameOrId(name)
      if (!col.fields.getByName('created')) {
        col.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
      }
      if (!col.fields.getByName('updated')) {
        col.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
      }
      app.save(col)
    }
  },
  (app) => {
    // down: remove os campos de volta
    for (const name of [
      'contacts',
      'opportunities',
      'stage_history',
      'forms',
      'form_versions',
      'submissions',
      'clinic_settings',
    ]) {
      try {
        const col = app.findCollectionByNameOrId(name)
        const c = col.fields.getByName('created')
        if (c) col.fields.removeByName('created')
        const u = col.fields.getByName('updated')
        if (u) col.fields.removeByName('updated')
        app.save(col)
      } catch (_) {}
    }
  },
)
