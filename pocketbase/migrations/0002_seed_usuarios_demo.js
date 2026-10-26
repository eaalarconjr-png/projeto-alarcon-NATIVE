// task AL-F1-01: contas de demonstração da equipe (dados fictícios, ambiente de construção)
// Papéis: admin (Ernesto), atendimento (Lizandra), gestor de tráfego (demonstração).
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const seed = [
      {
        email: 'ernesto@alarcon.com.br',
        password: 'Alarcon@Demo1',
        name: 'Dr. Ernesto Alarcon',
        role: 'admin',
      },
      {
        email: 'lizandra@alarcon.com.br',
        password: 'Alarcon@Demo2',
        name: 'Lizandra Alves',
        role: 'atendimento',
      },
      {
        email: 'gestor@alarcon.com.br',
        password: 'Alarcon@Demo3',
        name: 'Gestor de Tráfego (demo)',
        role: 'gestor_trafego',
      },
    ]
    for (const s of seed) {
      try {
        app.findAuthRecordByEmail('_pb_users_auth_', s.email)
        continue // já existe: idempotente
      } catch (_) {}
      const record = new Record(users)
      record.setEmail(s.email)
      record.setPassword(s.password)
      record.setVerified(true)
      record.set('name', s.name)
      record.set('role', s.role)
      app.save(record)
    }
  },
  (app) => {
    for (const email of [
      'ernesto@alarcon.com.br',
      'lizandra@alarcon.com.br',
      'gestor@alarcon.com.br',
    ]) {
      try {
        app.delete(app.findAuthRecordByEmail('_pb_users_auth_', email))
      } catch (_) {}
    }
  },
)
