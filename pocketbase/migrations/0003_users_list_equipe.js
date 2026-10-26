// task AL-F1-02: equipe autenticada pode listar usuários (nomes/ids) para escolher o responsável
// da oportunidade. E-mails continuam ocultos (emailVisibility false) e a ficha segue negada ao
// gestor de tráfego pelas regras das coleções de ficha.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.listRule = "@request.auth.id != ''"
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.listRule = 'id = @request.auth.id'
    app.save(users)
  },
)
