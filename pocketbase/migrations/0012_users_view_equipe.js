// correção do teste da fase 2: o expand de responsável (fila, ficha e avaliações) exige
// viewRule aberta na coleção users — a migration 0003 abriu só a listagem. E-mails seguem
// ocultos (emailVisibility false); nomes e papéis ficam visíveis para a equipe autenticada.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.viewRule = "@request.auth.id != ''"
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.viewRule = 'id = @request.auth.id'
    app.save(users)
  },
)
