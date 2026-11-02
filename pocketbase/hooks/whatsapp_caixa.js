// AL-F4-03: caixa de atendimento — ações da conversa (SPEC AL-F4-A, RN-21 a RN-28).
// Regras que este arquivo respeita:
// - Assumir/Transferir NÃO mudam `opportunities.owner` — são coisas diferentes (RN-26).
// - "Fui eu" (RN-23) só a própria pessoa marca, não se desfaz, e só faz sentido quando há
//   robô ativo no número (é o que separa a resposta da Clara da resposta humana).
// - "Não é paciente" (RN-27) encerra a oportunidade criada pelo WhatsApp e conclui o item;
//   mensagens novas caem só na caixa, sem item/alerta/oportunidade/acolhimento.
// - Anexo abre inline por rota autenticada (RN-28): o `media_url` nunca vai para o navegador.
// - Nada aqui envia mensagem a paciente: envio é só pela rota da AL-F4-02B.
// POCKETBASE JSVM: cada callback roda em VM própria — todo helper mora DENTRO do callback.

const guardInbox = (e) => {
  const u = e.auth
  if (!u) return { err: e.unauthorizedError() }
  const role = u.getString('role')
  if (role !== 'admin' && role !== 'atendimento') {
    return { err: e.forbiddenError('Acesso restrito ao atendimento.') }
  }
  return { user: u }
}

// ======================= ASSUMIR / TRANSFERIR =======================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/conversa/{id}/assumir',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    const role = u.getString('role')
    if (role !== 'admin' && role !== 'atendimento') return e.forbiddenError('Acesso restrito.')
    const id = String(e.request.pathValue('id') || '')
    const b = e.requestInfo().body || {}
    const targetUserId = String(b.user_id || u.id)

    let conv
    try {
      conv = $app.findRecordById('conversations', id)
    } catch (_) {
      return e.notFoundError('Conversa não encontrada.')
    }

    // RN-26: transferir para outro admin/atendimento
    if (targetUserId !== u.id) {
      let target
      try {
        target = $app.findRecordById('users', targetUserId)
      } catch (_) {
        return e.badRequestError('Pessoa não encontrada.')
      }
      const tr = target.getString('role')
      if (tr !== 'admin' && tr !== 'atendimento') {
        return e.badRequestError('Só é possível transferir para quem atende.')
      }
    }

    conv.set('assignee', targetUserId)
    $app.save(conv)

    // item aberto recebe o mesmo responsável e marca a primeira ação (Assumir ≠ responder)
    try {
      if (conv.getString('service_item')) {
        const it = $app.findRecordById('service_items', conv.getString('service_item'))
        const st = it.getString('status')
        if (st !== 'concluido' && st !== 'cancelado') {
          it.set('assignee', targetUserId)
          if (!it.getString('first_action_at')) it.set('first_action_at', new Date().toISOString())
          it.set('last_activity_at', new Date().toISOString())
          $app.save(it)
        }
      }
    } catch (_) {}

    // NUNCA altera opportunities.owner (RN-26)
    return e.json(200, { ok: true, assignee: targetUserId })
  },
  $apis.requireAuth(),
)

// ======================= FUI EU (RN-23) =======================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/mensagem/{id}/fui-eu',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    const role = u.getString('role')
    if (role !== 'admin' && role !== 'atendimento') return e.forbiddenError('Acesso restrito.')
    const id = String(e.request.pathValue('id') || '')

    let msg
    try {
      msg = $app.findRecordById('messages', id)
    } catch (_) {
      return e.notFoundError('Mensagem não encontrada.')
    }
    if (msg.getString('direction') !== 'saida') {
      return e.badRequestError('Só uma mensagem enviada pode ser marcada como sua.')
    }
    // só se ainda não foi declarada: não se desfaz (RN-23)
    if (msg.getBool('author_declared')) {
      return e.json(200, { ok: true, already: true })
    }

    msg.set('author_kind', 'equipe_celular')
    msg.set('author_user', u.id)
    msg.set('author_declared', true)
    $app.save(msg)

    // aplica RN-22: a espera termina com o horário da mensagem e fonte declarada
    try {
      const conv = $app.findRecordById('conversations', msg.getString('conversation'))
      if (conv.getString('service_item')) {
        const it = $app.findRecordById('service_items', conv.getString('service_item'))
        if (!it.getString('first_human_reply_at')) {
          it.set('first_human_reply_at', msg.getString('origin_ts') || new Date().toISOString())
          it.set('first_human_reply_source', 'celular_declarado')
          it.set('response_measure', 'real')
        }
        it.set('waiting_human', false)
        it.set('last_activity_at', new Date().toISOString())
        $app.save(it)
      }
    } catch (_) {}

    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)

// ======================= NÃO É PACIENTE (RN-27) =======================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/conversa/{id}/nao-paciente',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    const role = u.getString('role')
    if (role !== 'admin' && role !== 'atendimento') return e.forbiddenError('Acesso restrito.')
    const id = String(e.request.pathValue('id') || '')
    const b = e.requestInfo().body || {}
    const undo = b.undo === true

    let conv
    try {
      conv = $app.findRecordById('conversations', id)
    } catch (_) {
      return e.notFoundError('Conversa não encontrada.')
    }

    if (undo) {
      // "Voltar a paciente" desfaz o estado da conversa, mas NÃO reabre a oportunidade
      conv.set('link_state', conv.getString('opportunity') ? 'vinculada' : 'revisar')
      $app.save(conv)
      return e.json(200, { ok: true, link_state: conv.getString('link_state') })
    }

    conv.set('link_state', 'nao_paciente')
    $app.save(conv)

    // encerra a oportunidade CRIADA pelo WhatsApp, se houver e estiver aberta
    const opId = conv.getString('opportunity')
    if (opId) {
      try {
        const op = $app.findRecordById('opportunities', opId)
        if (op.getString('status') === 'aberta' && op.getString('origin_captured') === 'whatsapp') {
          op.set('status', 'encerrada')
          op.set('close_reason', 'nao_paciente')
          $app.save(op)
          // histórico da mudança de etapa (mantém a auditoria das fases 1–3)
          try {
            const h = new Record($app.findCollectionByNameOrId('stage_history'))
            h.set('opportunity', opId)
            h.set('from_stage', op.getString('stage'))
            h.set('to_stage', op.getString('stage'))
            h.set('author', u.id)
            h.set('note', 'Encerrada como "Não é paciente" pela caixa de WhatsApp.')
            $app.save(h)
          } catch (_) {}
        }
      } catch (_) {}
    }

    // conclui o item aberto
    try {
      if (conv.getString('service_item')) {
        const it = $app.findRecordById('service_items', conv.getString('service_item'))
        it.set('status', 'concluido')
        it.set('last_activity_at', new Date().toISOString())
        $app.save(it)
      }
    } catch (_) {}

    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)

// ======================= VINCULAR CONVERSA A FICHA =======================
// Resolve "Revisar vínculo", "Sem telefone" e contato com várias oportunidades.
routerAdd(
  'POST',
  '/backend/v1/whatsapp/conversa/{id}/vincular',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    const role = u.getString('role')
    if (role !== 'admin' && role !== 'atendimento') return e.forbiddenError('Acesso restrito.')
    const id = String(e.request.pathValue('id') || '')
    const b = e.requestInfo().body || {}
    const opportunityId = String(b.opportunity_id || '')

    let conv
    try {
      conv = $app.findRecordById('conversations', id)
    } catch (_) {
      return e.notFoundError('Conversa não encontrada.')
    }

    if (opportunityId) {
      let op
      try {
        op = $app.findRecordById('opportunities', opportunityId)
      } catch (_) {
        return e.badRequestError('Oportunidade não encontrada.')
      }
      conv.set('opportunity', op.id)
      if (!conv.getString('contact')) conv.set('contact', op.getString('contact'))
      conv.set('link_state', 'vinculada')
      $app.save(conv)
      // RN-21: ao vincular, o item de fila recebe a oportunidade
      try {
        if (conv.getString('service_item')) {
          const it = $app.findRecordById('service_items', conv.getString('service_item'))
          it.set('opportunity', op.id)
          $app.save(it)
        }
      } catch (_) {}
      return e.json(200, { ok: true, link_state: 'vinculada' })
    }

    // sem oportunidade informada: tenta o vínculo automático de novo (telefone já corrigido)
    const phone = conv.getString('contact_phone')
    if (!phone) return e.badRequestError('Conversa sem telefone: informe a oportunidade.')
    const found = $app.findRecordsByFilter('contacts', 'phone = {:p}', '', 3, 0, { p: phone })
    if (found.length !== 1) {
      return e.badRequestError('Não há um contato único com esse telefone. Escolha a oportunidade.')
    }
    const contact = found[0]
    conv.set('contact', contact.id)
    const openOpps = $app.findRecordsByFilter(
      'opportunities',
      'contact = {:c} && status = "aberta"',
      '-created',
      5,
      0,
      { c: contact.id },
    )
    if (openOpps.length === 1) {
      conv.set('opportunity', openOpps[0].id)
      conv.set('link_state', 'vinculada')
      $app.save(conv)
      try {
        if (conv.getString('service_item')) {
          const it = $app.findRecordById('service_items', conv.getString('service_item'))
          it.set('opportunity', openOpps[0].id)
          $app.save(it)
        }
      } catch (_) {}
      return e.json(200, { ok: true, link_state: 'vinculada' })
    }
    conv.set('link_state', 'revisar')
    $app.save(conv)
    return e.json(200, { ok: true, link_state: 'revisar', reason: 'multiplas_oportunidades' })
  },
  $apis.requireAuth(),
)

// ======================= ANEXO (RN-28) =======================
// O arquivo é repassado com fetch em fluxo; o `media_url` nunca sai na listagem.
routerAdd(
  'GET',
  '/backend/v1/whatsapp/mensagens/{id}/anexo',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    const role = u.getString('role')
    if (role !== 'admin' && role !== 'atendimento') return e.forbiddenError('Acesso restrito.')
    const id = String(e.request.pathValue('id') || '')

    let msg
    try {
      msg = $app.findRecordById('messages', id)
    } catch (_) {
      return e.notFoundError('Mensagem não encontrada.')
    }
    const url = msg.getString('media_url')
    if (!url) return e.json(404, { ok: false, error: 'anexo_indisponivel' })

    // host permitido: só a própria D-API (nunca busca arbitrária pelo servidor)
    let allowed = false
    try {
      const parsed = new URL(url)
      allowed =
        parsed.hostname === 'api.d-api.cloud' ||
        parsed.hostname.endsWith('.d-api.cloud') ||
        parsed.hostname.endsWith('.whatsapp.net')
    } catch (_) {}
    if (!allowed) return e.json(404, { ok: false, error: 'anexo_indisponivel' })

    let res
    try {
      res = $http.send({ url: url, method: 'GET', timeout: 15 })
    } catch (_) {
      return e.json(404, { ok: false, error: 'anexo_indisponivel' })
    }
    if (res.statusCode !== 200) {
      return e.json(404, { ok: false, error: 'anexo_indisponivel' })
    }

    let meta = {}
    try {
      meta = JSON.parse(msg.getString('media_meta') || '{}')
    } catch (_) {}
    const mime = String(
      meta.mimetype || res.header.get('Content-Type') || 'application/octet-stream',
    )
    // inline só para tipos seguros; o resto baixa como arquivo (nunca executa no navegador)
    const safeInline =
      /^(image\/(png|jpe?g|gif|webp)|audio\/|video\/(mp4|webm)|application\/pdf)/i.test(mime)
    e.response.header().set('Content-Type', mime)
    e.response
      .header()
      .set(
        'Content-Disposition',
        (safeInline ? 'inline' : 'attachment') +
          '; filename="' +
          String(meta.filename || 'anexo').replace(/[^\w.\-]/g, '_') +
          '"',
      )
    e.response.header().set('X-Content-Type-Options', 'nosniff')
    e.response.header().set('Cache-Control', 'private, no-store')
    e.response.write(res.body)
    return
  },
  $apis.requireAuth(),
)
