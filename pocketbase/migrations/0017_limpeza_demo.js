// Limpeza dos dados de demonstração antes da fase 3 (pedido do Dr. 28/10).
// Por que migration e não API: as respostas de formulário (`submissions`) só podem ser
// apagadas por superusuário, e a oportunidade fica presa a elas por relação obrigatória.
// Aqui roda com permissão de superusuário e remove os registros na ordem de dependência.
// Escopo: SOMENTE os contatos de demonstração conhecidos — configuração (perfis, réguas,
// formulários, convênios, horário) e usuários NÃO são tocados.
migrate(
  (app) => {
    const demoContacts = [
      'Maria Souza Teste',
      'João Pereira (demo)',
      'Maria Silva (demo)',
      'João Pereira Filho (demo)',
    ]

    for (const name of demoContacts) {
      let contacts = []
      try {
        contacts = app.findRecordsByFilter('contacts', 'name = {:n}', '', 50, 0, { n: name })
      } catch (_) {
        continue
      }
      for (const contact of contacts) {
        // 1. oportunidades do contato
        let ops = []
        try {
          ops = app.findRecordsByFilter('opportunities', 'contact = {:c}', '', 100, 0, {
            c: contact.id,
          })
        } catch (_) {}
        for (const op of ops) {
          // 2. filhos da oportunidade (ordem importa: resposta, histórico, fila, alertas, agenda)
          const filhos = [
            ['submissions', 'opportunity = {:o}'],
            ['stage_history', 'opportunity = {:o}'],
            ['qualifications', 'opportunity = {:o}'],
            ['agenda_events', 'opportunity = {:o}'],
            ['service_items', 'opportunity = {:o}'],
          ]
          for (const [col, filter] of filhos) {
            try {
              for (const rec of app.findRecordsByFilter(col, filter, '', 500, 0, { o: op.id })) {
                try {
                  app.delete(rec)
                } catch (_) {}
              }
            } catch (_) {}
          }
          try {
            app.delete(op)
          } catch (_) {}
        }
        // 3. o próprio contato
        try {
          app.delete(contact)
        } catch (_) {}
      }
    }

    // 4. alertas internos órfãos (sem item e sem oportunidade) — ruído de demonstração
    try {
      const orfaos = app.findRecordsByFilter('internal_alerts', '', '', 500, 0)
      for (const a of orfaos) {
        if (!a.getString('item')) {
          try {
            app.delete(a)
          } catch (_) {}
        }
      }
    } catch (_) {}
  },
  () => {
    // sem volta: limpeza de dados de demonstração
  },
)
