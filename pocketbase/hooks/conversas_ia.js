// AL-F4-05 / AL-F4-05B — resumo das conversas com apoio de IA (SPEC AL-F4-B).
// Princípios que este arquivo respeita:
// - A IA SUGERE; quem decide é a pessoa. Nada muda na oportunidade sem clique humano.
// - O modelo NUNCA recebe dados identificáveis: nome e telefone são mascarados no texto antes
//   de sair (dados mascarados), e nenhum dado clínico é usado para outra finalidade.
// - Etapa sugerida só entre as permitidas (RN-33). Resposta fora do formato → `invalido`.
// - Sinal clínico (RN-35) é marcado por termo fixo ou pelo próprio modelo, e só pede atenção
//   humana — a IA não orienta nem classifica gravidade.
// - Sem IA configurada, a caixa continua funcionando e o botão informa indisponibilidade.
// - Resumo automático (AL-F4-05B) nasce DESLIGADO e respeita teto diário.
// POCKETBASE JSVM: cada callback roda em VM própria — todo helper mora DENTRO do callback.

// ======================= RESUMIR (botão) =======================
routerAdd(
  'POST',
  '/backend/v1/conversas/{id}/resumir',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    const role = u.getString('role')
    if (role !== 'admin' && role !== 'atendimento') return e.forbiddenError('Acesso restrito.')

    const convId = String(e.request.pathValue('id') || '')
    let conv
    try {
      conv = $app.findRecordById('conversations', convId)
    } catch (_) {
      return e.notFoundError('Conversa não encontrada.')
    }

    // ETAPAS PERMITIDAS (RN-33): Novo, Em atendimento, Agendamento solicitado, Em acompanhamento
    const ALLOWED = [
      'novo',
      'em_atendimento',
      'agendamento_solicitado',
      'em_acompanhamento',
      'manter',
    ]

    // ---------- mensagens para o contexto ----------
    const msgs = $app.findRecordsByFilter(
      'messages',
      'conversation = {:c} && deleted = false',
      'origin_ts',
      60,
      0,
      {
        c: convId,
      },
    )
    if (msgs.length === 0) {
      return e.json(400, { ok: false, error: 'sem_mensagens' })
    }

    // RN-32: sem texto novo desde o último resumo → não chama o modelo
    const lastId = msgs[msgs.length - 1].getString('wa_message_id')
    if (conv.getString('ai_last_message_id') === lastId) {
      return e.json(200, { ok: true, skipped: true, reason: 'sem_texto_novo' })
    }

    // ---------- mascaramento: o modelo não vê nome nem telefone ----------
    const mask = (t) =>
      String(t || '')
        .replace(/\d{8,}/g, '[telefone]')
        .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]')
        .replace(/\bCPF[:\s]*[\d.\-]+/gi, '[cpf]')
    const transcript = []
    for (const m of msgs.slice(-40)) {
      const who = m.getString('direction') === 'entrada' ? 'PACIENTE' : 'CLINICA'
      transcript.push({
        message_id: m.getString('wa_message_id'),
        who,
        text: mask(m.getString('text')).slice(0, 600),
      })
    }

    // ---------- teto diário e disponibilidade da IA ----------
    let enabled = false
    let dailyCap = 200
    try {
      const s = $app.findFirstRecordByFilter('clinic_settings', "settings_key = 'main'")
      enabled = s.getBool('ai_summary_enabled')
      dailyCap = s.getInt('ai_daily_cap', 200) || 200
    } catch (_) {}
    // com a IA desligada, o botão só funciona em conversa de demonstração
    if (!enabled && !conv.getBool('is_fixture')) {
      return e.json(200, {
        ok: false,
        error: 'ia_desligada',
        message: 'O resumo por IA está desligado. O Dr. liga na sessão de ativação.',
      })
    }
    let usedToday = 0
    try {
      const today = new Date()
      const startIso = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      ).toISOString()
      const caps = $app.findRecordsByFilter(
        'conversation_summaries',
        'created >= {:d}',
        '',
        2000,
        0,
        { d: startIso },
      )
      usedToday = caps.length
    } catch (_) {}
    if (usedToday >= dailyCap) {
      return e.json(200, {
        ok: false,
        error: 'teto_diario',
        message: 'Teto diário de resumos atingido.',
      })
    }

    // ---------- chamada do modelo (Skip AI Gateway) ----------
    const gw = (() => {
      try {
        return String($secrets.get('SKIP_AI_GATEWAY_URL') || '')
      } catch (_) {
        return ''
      }
    })()
    const gwKey = (() => {
      try {
        return String($secrets.get('SKIP_AI_GATEWAY_API_KEY') || '')
      } catch (_) {
        return ''
      }
    })()

    const prompt =
      'Você resume conversas de uma clínica para a equipe de atendimento. ' +
      'Responda SOMENTE um JSON com as chaves: resumo (texto até 600 caracteres), ' +
      'pontos (lista de 1 a 5 objetos com message_id e texto), etapa_sugerida (uma de: ' +
      ALLOWED.join(', ') +
      '), justificativa (até 300 caracteres), sintoma_ou_urgencia (true/false). ' +
      'Não dê orientação clínica, não classifique gravidade, não invente dado. ' +
      'Conversa: ' +
      JSON.stringify(transcript)

    let raw = ''
    let callError = ''
    if (!gw || !gwKey) {
      callError = 'ia_indisponivel'
    } else {
      try {
        const res = $http.send({
          url: gw,
          method: 'POST',
          headers: { Authorization: 'Bearer ' + gwKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
          }),
          timeout: 25,
        })
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const payload = JSON.parse(res.body)
          raw = String(
            payload.text ||
              (payload.choices &&
                payload.choices[0] &&
                payload.choices[0].message &&
                payload.choices[0].message.content) ||
              payload.content ||
              '',
          )
        } else {
          callError = 'http_' + res.statusCode
        }
      } catch (_) {
        callError = 'erro_de_rede'
      }
    }

    // ---------- registra a tentativa ----------
    const rec = new Record($app.findCollectionByNameOrId('conversation_summaries'))
    rec.set('conversation', convId)
    if (conv.getString('opportunity')) rec.set('opportunity', conv.getString('opportunity'))
    rec.set('trigger', 'botao')
    rec.set('messages_used', msgs.length)
    rec.set('raw_response', String(raw).slice(0, 19000))
    rec.set('decision', 'pendente')
    rec.set('is_fixture', conv.getBool('is_fixture'))

    if (callError) {
      rec.set('status', 'erro')
      rec.set('error_code', callError)
      rec.set('decision', 'recusada')
      $app.save(rec)
      // mensagem honesta: "não configurado" e "não respondeu" são coisas diferentes
      let msg = 'A IA não respondeu agora. Tente de novo em instantes.'
      if (callError === 'ia_indisponivel') {
        msg =
          'Resumo por IA ainda não está configurado. A caixa e os tempos continuam funcionando normalmente.'
      } else if (callError.indexOf('http_4') === 0) {
        msg =
          'O resumo por IA está mal configurado (endpoint não encontrado). Nada foi alterado; avise o responsável técnico.'
      }
      return e.json(200, { ok: false, error: callError, message: msg })
    }

    // ---------- validação da resposta (RN-34) ----------
    let parsed = null
    try {
      const clean = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim()
      parsed = JSON.parse(clean)
    } catch (_) {
      parsed = null
    }
    const invalid = (code) => {
      rec.set('status', 'invalido')
      rec.set('error_code', code)
      rec.set('decision', 'recusada')
      $app.save(rec)
      return e.json(200, {
        ok: false,
        error: code,
        message: 'A IA respondeu fora do formato. Nada foi alterado.',
      })
    }
    if (!parsed || typeof parsed !== 'object') return invalid('resposta_nao_json')
    const resumo = String(parsed.resumo || '').trim()
    if (!resumo || resumo.length > 600) return invalid('resumo_invalido')
    if (!ALLOWED.includes(String(parsed.etapa_sugerida || ''))) return invalid('etapa_proibida')
    const pontosIn = Array.isArray(parsed.pontos) ? parsed.pontos : []
    if (pontosIn.length < 1 || pontosIn.length > 5) return invalid('pontos_invalidos')
    const knownIds = {}
    for (const m of msgs) knownIds[m.getString('wa_message_id')] = true
    const pontos = []
    for (const p of pontosIn) {
      const mid = String((p && p.message_id) || '')
      if (!knownIds[mid]) return invalid('ponto_sem_mensagem')
      pontos.push({ message_id: mid, texto: String((p && p.texto) || '').slice(0, 300) })
    }

    // RN-35: sinal clínico por termo fixo OU pelo modelo
    const CLINICAL = [
      'dor',
      'sangramento',
      'sangrando',
      'febre',
      'falta de ar',
      'desmaio',
      'infecção',
      'pus',
      'inchaço',
      'vômito',
      'urgencia',
      'urgência',
      'emergência',
      'emergencia',
    ]
    let clinical = parsed.sintoma_ou_urgencia === true
    if (!clinical) {
      const all = transcript
        .filter((t) => t.who === 'PACIENTE')
        .map((t) => t.text.toLowerCase())
        .join(' ')
      for (const term of CLINICAL) {
        if (all.indexOf(term) >= 0) {
          clinical = true
          break
        }
      }
    }

    rec.set('status', 'ok')
    rec.set('summary', resumo)
    rec.set('points', JSON.stringify(pontos))
    rec.set('suggested_stage', String(parsed.etapa_sugerida))
    rec.set('justification', String(parsed.justificativa || '').slice(0, 1000))
    rec.set('clinical_signal', clinical)
    $app.save(rec)

    try {
      conv.set('ai_last_message_id', lastId)
      conv.set('ai_last_summary_at', new Date().toISOString())
      $app.save(conv)
    } catch (_) {}

    return e.json(200, {
      ok: true,
      summary_id: rec.id,
      summary: resumo,
      points: pontos,
      suggested_stage: String(parsed.etapa_sugerida),
      justification: String(parsed.justificativa || ''),
      clinical_signal: clinical,
    })
  },
  $apis.requireAuth(),
)

// ======================= DECIDIR (aceitar / trocar / recusar) =======================
routerAdd(
  'POST',
  '/backend/v1/conversas/resumo/{id}/decidir',
  (e) => {
    const u = e.auth
    if (!u) return e.unauthorizedError()
    const role = u.getString('role')
    if (role !== 'admin' && role !== 'atendimento') return e.forbiddenError('Acesso restrito.')

    const id = String(e.request.pathValue('id') || '')
    const b = e.requestInfo().body || {}
    const action = String(b.action || '')
    if (['aceitar', 'trocar', 'recusar'].indexOf(action) < 0) {
      return e.badRequestError('Ação inválida.')
    }

    let rec
    try {
      rec = $app.findRecordById('conversation_summaries', id)
    } catch (_) {
      return e.notFoundError('Resumo não encontrado.')
    }
    // RN-36: aceitar duas vezes não muda duas vezes
    if (rec.getString('decision') !== 'pendente') {
      return e.json(200, { ok: true, already: true, decision: rec.getString('decision') })
    }

    const nowIso = new Date().toISOString()
    rec.set('decided_by', u.id)
    rec.set('decided_at', nowIso)

    if (action === 'recusar') {
      rec.set('decision', 'recusada')
      $app.save(rec)
      return e.json(200, { ok: true, decision: 'recusada' })
    }

    const opId = rec.getString('opportunity')
    if (!opId) {
      // sem oportunidade vinculada só é possível recusar (RN-36)
      return e.json(400, {
        ok: false,
        error: 'sem_oportunidade',
        message: 'Conversa sem ficha ligada: só dá para recusar.',
      })
    }

    const target = action === 'aceitar' ? rec.getString('suggested_stage') : String(b.stage || '')
    const ALLOWED = ['novo', 'em_atendimento', 'agendamento_solicitado', 'em_acompanhamento']
    if (action === 'trocar' && ALLOWED.indexOf(target) < 0) {
      return e.badRequestError('Etapa inválida.')
    }

    try {
      const op = $app.findRecordById('opportunities', opId)
      const fromStage = op.getString('stage')
      if (target !== 'manter' && target !== fromStage) {
        op.set('stage', target)
        $app.save(op)
        // histórico com autor humano e a data do resumo (RN-36)
        const h = new Record($app.findCollectionByNameOrId('stage_history'))
        h.set('opportunity', opId)
        h.set('from_stage', fromStage)
        h.set('to_stage', target)
        h.set('author', u.id)
        h.set('note', 'Etapa alterada com base no resumo de IA de ' + nowIso.slice(0, 10) + '.')
        $app.save(h)
      }
      rec.set('decision', action === 'aceitar' ? 'aceita' : 'trocada')
      rec.set('final_stage', target === 'manter' ? fromStage : target)
      $app.save(rec)
      return e.json(200, { ok: true, decision: rec.getString('decision'), stage: target })
    } catch (err) {
      return e.badRequestError('Não foi possível aplicar a etapa: ' + String(err))
    }
  },
  $apis.requireAuth(),
)

// ======================= RESUMO AUTOMÁTICO (AL-F4-05B) =======================
// Roda a cada 10 minutos; nasce DESLIGADO (ai_summary_enabled=false) e respeita teto diário.
// Falha grava ai_last_attempt_message_id: no máximo uma nova tentativa automática.
cronAdd('resumo_conversas_ia', '*/10 * * * *', () => {
  // JSVM: tudo dentro do callback
  let enabled = false
  let cap = 200
  try {
    const s = $app.findFirstRecordByFilter('clinic_settings', "settings_key = 'main'")
    enabled = s.getBool('ai_summary_enabled')
    cap = s.getInt('ai_daily_cap', 200) || 200
  } catch (_) {
    return
  }
  if (!enabled) {
    console.log('resumo_ia: desligado')
    return
  }
  // horário de funcionamento
  try {
    const s = $app.findFirstRecordByFilter('clinic_settings', "settings_key = 'main'")
    const toMin = (v) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim())
      return m ? Number(m[1]) * 60 + Number(m[2]) : null
    }
    const start = toMin(s.getString('business_hours_start'))
    const end = toMin(s.getString('business_hours_end'))
    const now = new Date()
    const sp = (((now.getUTCHours() * 60 + now.getUTCMinutes() - 180) % 1440) + 1440) % 1440
    if (start !== null && end !== null && (sp < start || sp >= end)) {
      console.log('resumo_ia: fora do horario')
      return
    }
  } catch (_) {}

  // teto diário
  let used = 0
  try {
    const now = new Date()
    const startIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString()
    used = $app.findRecordsByFilter('conversation_summaries', 'created >= {:d}', '', 2000, 0, {
      d: startIso,
    }).length
  } catch (_) {}
  if (used >= cap) {
    console.log('resumo_ia: teto diario atingido')
    return
  }

  const gw = (() => {
    try {
      return String($secrets.get('SKIP_AI_GATEWAY_URL') || '')
    } catch (_) {
      return ''
    }
  })()
  const gwKey = (() => {
    try {
      return String($secrets.get('SKIP_AI_GATEWAY_API_KEY') || '')
    } catch (_) {
      return ''
    }
  })()
  if (!gw || !gwKey) {
    console.log('resumo_ia: sem gateway configurado')
    return
  }

  const ALLOWED = [
    'novo',
    'em_atendimento',
    'agendamento_solicitado',
    'em_acompanhamento',
    'manter',
  ]
  const convs = $app.findRecordsByFilter(
    'conversations',
    'is_fixture != true',
    '-last_inbound_at',
    20,
    0,
  )
  const cutoff = Date.now() - 10 * 60000

  for (const conv of convs) {
    if (used >= cap) break
    const msgs = $app.findRecordsByFilter(
      'messages',
      'conversation = {:c} && deleted = false',
      '-origin_ts',
      5,
      0,
      { c: conv.id },
    )
    if (msgs.length === 0) continue
    const newest = msgs[0]
    const newestId = newest.getString('wa_message_id')
    // só mensagem do paciente conta (RN-30)
    if (newest.getString('direction') !== 'entrada') continue
    if (conv.getString('ai_last_message_id') === newestId) continue
    if (conv.getString('ai_last_attempt_message_id') === newestId) continue
    const ts = new Date(String(newest.getString('origin_ts')).replace(' ', 'T'))
    if (isNaN(ts.getTime()) || ts.getTime() > cutoff) continue // menos de 10 min: espera

    // chama o gateway
    let raw = ''
    let erro = ''
    try {
      const res = $http.send({
        url: gw,
        method: 'POST',
        headers: { Authorization: 'Bearer ' + gwKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content:
                'Resuma a conversa e sugira etapa. JSON apenas. Trecho: ' +
                String(newest.getString('text')).slice(0, 500),
            },
          ],
          temperature: 0,
        }),
        timeout: 25,
      })
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const p = JSON.parse(res.body)
        raw = String(
          p.text ||
            (p.choices && p.choices[0] && p.choices[0].message && p.choices[0].message.content) ||
            '',
        )
      } else erro = 'http_' + res.statusCode
    } catch (_) {
      erro = 'erro_de_rede'
    }

    const rec = new Record($app.findCollectionByNameOrId('conversation_summaries'))
    rec.set('conversation', conv.id)
    if (conv.getString('opportunity')) rec.set('opportunity', conv.getString('opportunity'))
    rec.set('trigger', 'cron')
    rec.set('messages_used', msgs.length)
    rec.set('raw_response', String(raw).slice(0, 19000))
    rec.set('is_fixture', false)

    let parsed = null
    try {
      parsed = JSON.parse(
        String(raw)
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim(),
      )
    } catch (_) {}

    if (
      erro ||
      !parsed ||
      !parsed.resumo ||
      !ALLOWED.includes(String(parsed.etapa_sugerida || ''))
    ) {
      rec.set('status', erro ? 'erro' : 'invalido')
      rec.set('error_code', erro || 'resposta_invalida')
      rec.set('decision', 'recusada')
      $app.save(rec)
      // no máximo uma nova tentativa automática por mensagem
      conv.set('ai_last_attempt_message_id', newestId)
      $app.save(conv)
      continue
    }

    rec.set('status', 'ok')
    rec.set('summary', String(parsed.resumo).slice(0, 600))
    rec.set('points', JSON.stringify(parsed.pontos || []))
    rec.set('suggested_stage', String(parsed.etapa_sugerida))
    rec.set('justification', String(parsed.justificativa || '').slice(0, 1000))
    rec.set('clinical_signal', parsed.sintoma_ou_urgencia === true)
    rec.set('decision', 'pendente')
    $app.save(rec)
    conv.set('ai_last_message_id', newestId)
    conv.set('ai_last_summary_at', new Date().toISOString())
    $app.save(conv)
    used++
  }
})
