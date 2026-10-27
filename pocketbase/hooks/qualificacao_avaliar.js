// task AL-F2-02: avaliação de qualificação explicável — rota autenticada no servidor.
// Regras da SPEC: mesma versão da regra + mesmos dados produzem o mesmo resultado
// (determinístico); campo ausente não recebe zero silenciosamente (vira "sem dado" e o
// estado é incompleta); nota baixa não arquiva contato nem bloqueia atendimento; recalcular
// cria registro novo preservando o anterior. Sem regra ativa: nao_configurada, nada salvo.
routerAdd(
  'POST',
  '/backend/v1/qualificacao/avaliar',
  (e) => {
    const body = e.requestInfo().body || {}
    const opId = String(body.opportunity_id || '')
    if (!opId) {
      return e.badRequestError('Informe a oportunidade a avaliar.')
    }

    let op
    try {
      op = $app.findRecordById('opportunities', opId)
    } catch (_) {
      return e.notFoundError('Oportunidade não encontrada.')
    }

    // 1. regra ativa (uma só, garantido pela ativação)
    let rule = null
    try {
      rule = $app.findFirstRecordByFilter('qualification_rule_versions', "status = 'ativo'")
    } catch (_) {}
    if (!rule) {
      return e.json(200, {
        evaluation_id: null,
        state: 'nao_configurada',
        score: null,
        explanation: [],
        rule_version: null,
      })
    }

    let criteria
    try {
      criteria = JSON.parse(rule.getString('criteria'))
    } catch (_) {
      return e.badRequestError('Regra ativa com configuração inválida.')
    }
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return e.badRequestError('Regra ativa sem critérios.')
    }

    // 2. dados da oportunidade e das respostas de formulário vinculadas a ela
    const subs = $app.findRecordsByFilter('submissions', 'opportunity = {:o}', '-created', 50, 0, {
      o: opId,
    })
    // para critérios de resposta, compara o valor gravado E o rótulo da opção escolhida
    const answerValues = []
    for (const sub of subs) {
      let answers = {}
      try {
        answers = JSON.parse(sub.getString('answers') || '{}')
      } catch (_) {}
      let labelsById = {}
      try {
        const version = $app.findRecordById('form_versions', sub.getString('form_version'))
        const schema = JSON.parse(version.getString('schema') || '{}')
        for (const q of schema.questions || []) {
          if (q.type === 'escolha') {
            for (const opt of q.options || []) {
              labelsById[opt.id] = String(opt.label || '')
            }
          }
        }
      } catch (_) {}
      for (const key of Object.keys(answers)) {
        const value = String(answers[key] || '')
        const labels = labelsById[value] ? [labelsById[value]] : []
        answerValues.push({ value, labels })
      }
    }

    const norm = (s) =>
      String(s || '')
        .trim()
        .toLowerCase()
    const explanation = []
    let score = 0
    let missing = false

    for (const c of criteria) {
      const weight = Number(c.weight) || 0
      const expected = norm(c.expected)
      let value = null
      let matchedLabels = []

      if (c.source === 'modalidade') {
        value = op.getString('modality')
      } else if (c.source === 'origem') {
        value = op.getString('origin_declared')
      } else {
        // resposta: procura em todas as respostas vinculadas à oportunidade
        for (const a of answerValues) {
          if (norm(a.value) === expected || a.labels.some((l) => norm(l) === expected)) {
            value = a.value
            matchedLabels = a.labels
            break
          }
        }
      }

      if (value === null || value === '') {
        explanation.push({
          label: String(c.label || ''),
          weight,
          status: 'sem_dado',
          motivo: 'Sem dado lançado para este critério — não conta como zero.',
        })
        missing = true
        continue
      }

      const hit =
        c.source === 'resposta'
          ? matchedLabels.length > 0 || norm(value) === expected
          : norm(value) === expected
      if (hit) {
        score += weight
      }
      explanation.push({
        label: String(c.label || ''),
        weight,
        status: hit ? 'atingido' : 'nao_atingido',
        valor: matchedLabels.length ? matchedLabels[0] : value,
        motivo: hit ? `Critério atingido (+${weight})` : 'Valor diferente do esperado — não soma.',
      })
    }

    const state = missing ? 'incompleta' : 'completa'

    // 3. registra a avaliação (imutável; recalcular cria outra)
    const rec = new Record($app.findCollectionByNameOrId('qualifications'))
    rec.set('opportunity', opId)
    rec.set('rule_version', rule.id)
    rec.set('state', state)
    rec.set('score', score)
    rec.set('explanation', JSON.stringify(explanation))
    rec.set('evaluated_by', e.auth.id)
    $app.save(rec)

    return e.json(200, {
      evaluation_id: rec.id,
      state,
      score,
      explanation,
      rule_version: rule.getInt('version_number', 0),
    })
  },
  $apis.requireAuth(),
)
