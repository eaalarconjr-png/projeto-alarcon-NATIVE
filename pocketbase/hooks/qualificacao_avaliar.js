// AL-F2-02 revisado — pedido do Dr. Ernesto (27/10, 18:32):
// vários PERFIS de paciente podem estar ativos ao mesmo tempo. A avaliação roda todos os perfis
// ativos sobre a mesma oportunidade, calcula a aderência de cada um (pontos obtidos ÷ pontos
// possíveis) e devolve o ranking: qual perfil é o mais pretendido pela clínica, qual é o menos.
// O peso estratégico do perfil desempata aderências iguais — é a prioridade que a clínica declara.
// Regras da SPEC mantidas: determinístico, ausente não é zero (vira "sem dado"), nota baixa não
// arquiva nem bloqueia, recalcular cria registro novo preservando o anterior.
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

    // 1. TODOS os perfis ativos (não só um)
    const rules = $app.findRecordsByFilter(
      'qualification_rule_versions',
      "status = 'ativo'",
      '-strategic_weight,-version_number',
      50,
      0,
    )
    if (!rules || rules.length === 0) {
      return e.json(200, {
        evaluation_id: null,
        state: 'nao_configurada',
        score: null,
        explanation: [],
        rule_version: null,
        best_profile_name: '',
        fit_pct: null,
        results: [],
      })
    }

    // 2. dados da oportunidade e das respostas de formulário vinculadas a ela
    const subs = $app.findRecordsByFilter('submissions', 'opportunity = {:o}', '-created', 50, 0, {
      o: opId,
    })
    const answerValues = []
    for (const sub of subs) {
      let answers = {}
      try {
        answers = JSON.parse(sub.getString('answers') || '{}')
      } catch (_) {}
      const labelsById = {}
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

    // Valores válidos de cada origem de dado (correção 28/10): o "valor esperado" era texto
    // livre e um perfil podia ficar eternamente em 0% sem ninguém perceber. Perfil com critério
    // fora da lista vira "configuração inválida" — aparece, não zera em silêncio.
    const VALID_TARGETS = {
      modalidade: ['particular', 'convenio', 'reembolso'],
      origem: ['whatsapp', 'site', 'indicacao', 'convenio_app', 'outro', 'nao_identificado'],
      cuidado: ['cirurgico', 'clinico'],
    }
    const invalidCriteria = (criteria) => {
      const bad = []
      for (const c of criteria) {
        const list = VALID_TARGETS[c.source]
        if (!list) continue // 'resposta' casa com o texto da opção do formulário
        if (!list.includes(norm(c.expected))) {
          bad.push(String(c.label || ''))
        }
      }
      return bad
    }

    // 3. avalia cada perfil ativo com os mesmos dados
    const results = []
    for (const rule of rules) {
      let criteria
      try {
        criteria = JSON.parse(rule.getString('criteria'))
      } catch (_) {
        criteria = null
      }
      if (!Array.isArray(criteria) || criteria.length === 0) continue

      const explanation = []
      let score = 0
      let maxScore = 0
      let missing = false

      for (const c of criteria) {
        const weight = Number(c.weight) || 0
        maxScore += weight
        const expected = norm(c.expected)
        let value = null
        let matchedLabels = []

        if (c.source === 'modalidade') {
          value = op.getString('modality')
        } else if (c.source === 'origem') {
          value = op.getString('origin_declared')
        } else if (c.source === 'cuidado') {
          value = op.getString('care_type')
        } else {
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
        if (hit) score += weight

        explanation.push({
          label: String(c.label || ''),
          weight,
          status: hit ? 'atingido' : 'nao_atingido',
          valor: matchedLabels.length ? matchedLabels[0] : value,
          motivo: hit
            ? `Critério atingido (+${weight})`
            : 'Valor diferente do esperado — não soma.',
        })
      }

      const fitPct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
      results.push({
        rule_id: rule.id,
        rule_version: rule.getInt('version_number', 0),
        profile_name:
          rule.getString('profile_name') || `Perfil v${rule.getInt('version_number', 0)}`,
        strategic_weight: rule.getInt('strategic_weight', 10),
        state: missing ? 'incompleta' : 'completa',
        score,
        max_score: maxScore,
        fit_pct: fitPct,
        fit_level: fitPct >= 75 ? 'alta' : fitPct >= 40 ? 'media' : 'baixa',
        explanation,
      })
    }

    if (results.length === 0) {
      return e.badRequestError('Nenhum perfil ativo com critérios válidos.')
    }

    // 4. ranking SÓ entre perfis com dado completo: ausente não é zero, então perfil que
    // depende de um dado não lançado não pode ser tratado como "menos pretendido".
    const complete = results.filter((r) => r.state === 'completa')
    complete.sort((a, b) => {
      if (b.fit_pct !== a.fit_pct) return b.fit_pct - a.fit_pct
      if (b.strategic_weight !== a.strategic_weight) return b.strategic_weight - a.strategic_weight
      return b.score - a.score
    })
    complete.forEach((r, i) => {
      r.rank = i + 1
    })
    results.sort((a, b) => {
      const ra = a.rank || 999
      const rb = b.rank || 999
      if (ra !== rb) return ra - rb
      return b.strategic_weight - a.strategic_weight
    })

    const best = complete.length ? complete[0] : results[0]
    const worst = complete.length ? complete[complete.length - 1] : results[results.length - 1]

    // 5. registra a avaliação (imutável; recalcular cria outra)
    const rec = new Record($app.findCollectionByNameOrId('qualifications'))
    rec.set('opportunity', opId)
    rec.set('rule_version', best.rule_id)
    rec.set('state', best.state)
    rec.set('score', best.score)
    rec.set('explanation', JSON.stringify(best.explanation))
    rec.set('evaluated_by', e.auth.id)
    rec.set('results', JSON.stringify(results))
    rec.set('best_profile_name', best.profile_name)
    rec.set('fit_pct', best.fit_pct)
    $app.save(rec)

    return e.json(200, {
      evaluation_id: rec.id,
      state: best.state,
      score: best.score,
      explanation: best.explanation,
      rule_version: best.rule_version,
      best_profile_name: best.profile_name,
      best_fit_pct: best.fit_pct,
      worst_profile_name: complete.length > 1 ? worst.profile_name : '',
      worst_fit_pct: complete.length > 1 ? worst.fit_pct : null,
      fit_pct: best.fit_pct,
      complete_profiles: complete.length,
      results,
    })
  },
  $apis.requireAuth(),
)
