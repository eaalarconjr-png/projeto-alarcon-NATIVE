// task AL-F1-05: captura pública de respostas — rota aberta com validação no servidor.
// Regras da SPEC: envio passa pelo servidor, valida campos permitidos e limites de tamanho,
// aplica limitação básica de abuso, entrada repetida da mesma submissão retorna o mesmo
// resultado (idempotência), origem capturada separada da declarada, cliente público não
// escolhe clínica/responsável/score/status.
routerAdd('POST', '/backend/v1/formularios/{versionId}/respostas', (e) => {
  const versionId = e.request.pathValue('versionId')
  const body = e.requestInfo().body || {}

  // 1. limitação básica de abuso: tamanho do corpo
  const raw = JSON.stringify(body)
  if (raw.length > 20000) {
    return e.badRequestError('Envio muito grande. Reduza o tamanho das respostas.')
  }

  // 2. identificador único de submissão (idempotência)
  const submissionKey = String(body.submission_key || '')
  if (!submissionKey || submissionKey.length > 100) {
    return e.badRequestError('Identificador de submissão ausente ou inválido.')
  }

  // 3. a versão precisa existir e estar publicada
  let version
  try {
    version = $app.findRecordById('form_versions', versionId)
  } catch (_) {
    return e.notFoundError('Formulário não encontrado ou fora do ar.')
  }
  if (version.getString('status') !== 'publicada') {
    return e.badRequestError('Este formulário não está recebendo respostas.')
  }

  // 4. idempotência: mesma submissão retorna o mesmo resultado
  const existing = $app.findRecordsByFilter('submissions', 'submission_key = {:k}', '', 1, 0, {
    k: submissionKey,
  })
  if (existing.length > 0) {
    const prev = existing[0]
    return e.json(200, {
      submission_id: prev.id,
      opportunity_id: prev.getString('opportunity'),
      duplicate: true,
    })
  }

  // 5. valida as respostas contra o esquema da versão (campos permitidos, obrigatórios)
  let schema
  try {
    schema = JSON.parse(version.getString('schema'))
  } catch (_) {
    return e.badRequestError('Formulário com configuração inválida.')
  }
  if (!schema || !Array.isArray(schema.questions)) {
    return e.badRequestError('Formulário com configuração inválida.')
  }
  const questions = (schema && schema.questions) || []
  const answersIn = body.answers || {}
  const answers = {}
  for (const q of questions) {
    const val = answersIn[q.id]
    if (val === undefined || val === null || String(val).trim() === '') {
      if (q.required) {
        return e.badRequestError('Resposta obrigatória ausente: ' + q.label)
      }
      continue
    }
    const sval = String(val).trim().slice(0, 500)
    if (q.type === 'telefone') {
      const digits = sval.replace(/\D/g, '')
      if (digits.length < 10 || digits.length > 13) {
        return e.badRequestError('Telefone inválido em: ' + q.label)
      }
      answers[q.id] = digits
    } else if (q.type === 'escolha') {
      const ok = (q.options || []).some((o) => o.id === sval)
      if (!ok) {
        return e.badRequestError('Resposta inválida em: ' + q.label)
      }
      answers[q.id] = sval
    } else {
      answers[q.id] = sval
    }
  }
  // nada além das perguntas do esquema entra
  if (Object.keys(answersIn).length > questions.length + 5) {
    return e.badRequestError('Respostas em excesso.')
  }

  // 6. origem capturada (parâmetros de campanha, só se presentes) e declarada (o cliente não escolhe status/score)
  const query = e.requestInfo().query || {}
  const captured = [query.utm_source, query.utm_medium, query.utm_campaign, query.click_id]
    .filter((v) => v)
    .map((v) => String(v).slice(0, 100))
    .join('|')
    .slice(0, 500)

  const declared = ['whatsapp', 'site', 'indicacao', 'convenio_app', 'outro'].includes(
    String(body.origin_declared),
  )
    ? String(body.origin_declared)
    : 'nao_identificado'

  // 7. resolve o contato pelo telefone (correspondência inequívoca reutiliza; senão cria)
  const phoneQ = questions.find((q) => q.type === 'telefone')
  let contactId = ''
  let contactName = ''
  if (phoneQ) {
    const digits = String(answers[phoneQ.id] || '').replace(/\D/g, '')
    if (digits.length >= 10) {
      const matches = $app.findRecordsByFilter('contacts', 'phone = {:p}', '', 2, 0, { p: digits })
      if (matches.length === 1) {
        contactId = matches[0].id
        contactName = matches[0].getString('name')
      } else if (matches.length === 0) {
        const nameQ =
          questions.find((q) => q.type === 'texto' && /nome/i.test(q.label)) ||
          questions.find((q) => q.type === 'texto')
        const name = nameQ ? String(answers[nameQ.id] || '').slice(0, 120) : ''
        if (name) {
          const rec = new Record($app.findCollectionByNameOrId('contacts'))
          rec.set('name', name)
          rec.set('phone', digits)
          rec.set('source_declared', declared === 'nao_identificado' ? 'outro' : declared)
          $app.save(rec)
          contactId = rec.id
          contactName = name
        }
      }
      // 2+ correspondências: sem fusão — cria contato novo e deixa a revisão humana (SPEC)
    }
  }
  if (!contactId) {
    return e.badRequestError('Não foi possível identificar o contato: informe nome e telefone.')
  }

  // 8. cria a oportunidade (etapa inicial, dono = admin padrão; cliente público não escolhe)
  const admins = $app.findRecordsByFilter('users', "role = 'admin'", '', 1, 0)
  if (admins.length === 0) {
    return e.badRequestError('Clínica sem administrador configurado.')
  }
  const interestQ = questions.find((q) => q.type === 'escolha' || q.type === 'texto')
  const interest = interestQ
    ? String(answers[interestQ.id] || 'Contato pelo formulário').slice(0, 200)
    : 'Contato pelo formulário'
  const op = new Record($app.findCollectionByNameOrId('opportunities'))
  op.set('contact', contactId)
  op.set('interest', interest)
  op.set('modality', 'particular')
  op.set('owner', admins[0].id)
  op.set('stage', 'novo')
  op.set('status', 'aberta')
  op.set('origin_declared', declared)
  op.set('origin_captured', captured)
  $app.save(op)

  // 9. grava a submissão ligada à versão preenchida
  const sub = new Record($app.findCollectionByNameOrId('submissions'))
  sub.set('form_version', versionId)
  sub.set('submission_key', submissionKey)
  sub.set('answers', JSON.stringify(answers))
  sub.set('origin_declared', declared)
  sub.set('origin_captured', captured)
  sub.set('opportunity', op.id)
  $app.save(sub)

  return e.json(201, {
    submission_id: sub.id,
    opportunity_id: op.id,
    duplicate: false,
  })
})
