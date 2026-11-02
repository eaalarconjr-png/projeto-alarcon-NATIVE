// Correção descoberta ao ativar as réguas de alerta (28/10): as oportunidades tinham
// `created` VAZIO. Sem data, nenhuma régua baseada em tempo sabe há quanto tempo o paciente
// está sem interação — o alerta nunca dispararia e ninguém perceberia.
// Esta migration preenche o campo com a última atividade conhecida (`updated`), que é dado
// real e verificável. Nunca inventa data: se não houver nem `updated`, deixa vazio.
migrate(
  (app) => {
    const names = ['opportunities', 'contacts']
    for (const name of names) {
      for (const rec of app.findAllRecords(name)) {
        if (rec.getString('created')) continue
        const fallback = rec.getString('updated')
        if (!fallback) continue
        rec.set('created', fallback)
        try {
          app.save(rec)
        } catch (_) {
          // AutodateField pode recusar escrita direta; nesse caso o motor usa `updated`
        }
      }
    }
  },
  () => {
    // sem volta: preencher data de criação é correção de dado, não mudança de schema
  },
)
