// AL-F3-02: importação de investimento e métricas de campanha por CSV.
// Regras da SPEC: modelo padronizado (não mapeador universal); fluxo carregar → prévia →
// confirmar lote → persistir; idempotência por plataforma+conta+campanha+dia+origem, então
// reimportar o MESMO arquivo não soma gasto duas vezes; investimento ausente é indisponível
// (arquivo vazio não prova gasto zero); não misturar moedas sem conversão definida.
// Nada aqui recebe dado de paciente: só conta, campanha, dia, gasto e métricas.

// 1. prévia: recebe as linhas já parseadas no app e devolve o que seria importado/rejeitado.
routerAdd(
  'POST',
  '/backend/v1/painel/importar/previa',
  (e) => {
    const body = e.requestInfo().body || {}
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (rows.length === 0) return e.badRequestError('Nenhuma linha para conferir.')
    if (rows.length > 5000) return e.badRequestError('Envie no máximo 5000 linhas por lote.')

    const validPlatforms = ['google', 'meta', 'instagram', 'outro']
    const accepted = []
    const rejected = []
    const currencies = {}

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {}
      const line = i + 2 // +2: cabeçalho na linha 1
      const platform = String(r.platform || '').trim().toLowerCase()
      const account_id = String(r.account_id || '').trim()
      const campaign_id = String(r.campaign_id || '').trim()
      const day = String(r.day || '').trim()
      const currency = String(r.currency || '').trim().toUpperCase()
      const spend = r.spend

      const problems = []
      if (!validPlatforms.includes(platform)) problems.push('plataforma inválida')
      if (!account_id) problems.push('conta ausente')
      if (!campaign_id) problems.push('campanha ausente')
      const dayDate = new Date(day.replace(' ', 'T'))
      if (!day || isNaN(dayDate.getTime())) problems.push('data inválida')
      if (!/^[A-Z]{3}$/.test(currency)) problems.push('moeda inválida (use o código de 3 letras)')
      // investimento ausente NÃO é zero: a linha é rejeitada, não interpretada
      if (spend === '' || spend === null || spend === undefined) {
        problems.push('investimento ausente (não é tratado como zero)')
      } else if (isNaN(Number(spend)) || Number(spend) < 0) {
        problems.push('investimento inválido')
      }

      if (problems.length > 0) {
        rejected.push({ line, problems, raw: r })
        continue
      }

      currencies[currency] = (currencies[currency] || 0) + 1
      accepted.push({
        platform,
        account_id,
        account_name: String(r.account_name || '').trim(),
        campaign_id,
        campaign_name: String(r.campaign_name || '').trim(),
        day: dayDate.toISOString(),
        currency,
        spend_cents: Math.round(Number(spend) * 100),
        impressions: Number(r.impressions) >= 0 ? Math.round(Number(r.impressions)) : 0,
        clicks: Number(r.clicks) >= 0 ? Math.round(Number(r.clicks)) : 0,
        platform_leads: Number(r.platform_leads) >= 0 ? Math.round(Number(r.platform_leads)) : 0,
      })
    }

    const currencyList = Object.keys(currencies)
    const days = accepted.map((a) => a.day).sort()

    // quantas linhas já existem com a mesma chave (reimportação)
    let existing = 0
    for (const row of accepted) {
      try {
        const found = $app.findRecordsByFilter(
          'media_daily',
          'platform = {:p} && account_id = {:a} && campaign_id = {:c} && day = {:d} && source_kind = "import"',
          '',
          1,
          0,
          { p: row.platform, a: row.account_id, c: row.campaign_id, d: row.day },
        )
        if (found.length > 0) existing++
      } catch (_) {}
    }

    return e.json(200, {
      total: rows.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      rejected_sample: rejected.slice(0, 50),
      currencies: currencies,
      multi_currency: currencyList.length > 1,
      period: { from: days[0] || null, to: days[days.length - 1] || null },
      would_update_existing: existing,
      would_insert: accepted.length - existing,
      spend_total_cents: accepted.reduce((s, a) => s + a.spend_cents, 0),
      warnings:
        currencyList.length > 1
          ? ['Há mais de uma moeda no lote: os totais não têm conversão definida.']
          : [],
    })
  },
  $apis.requireAuth(),
)

// 2. confirmação: grava o lote aplicando idempotência (upsert por chave).
routerAdd(
  'POST',
  '/backend/v1/painel/importar/confirmar',
  (e) => {
    const user = e.auth
    if (!user) return e.unauthorizedError()
    const body = e.requestInfo().body || {}
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (rows.length === 0) return e.badRequestError('Nenhuma linha para importar.')
    if (rows.length > 5000) return e.badRequestError('Envie no máximo 5000 linhas por lote.')

    // cria o lote primeiro, para vincular as linhas
    const batch = new Record($app.findCollectionByNameOrId('media_imports'))
    batch.set('filename', String(body.filename || 'importacao.csv').slice(0, 200))
    batch.set('platform', String(body.platform || 'multiplo').slice(0, 40))
    batch.set('imported_by', user.id)
    batch.set('rows_total', Number(body.total) || rows.length)
    batch.set('rows_accepted', 0)
    batch.set('rows_rejected', Number(body.rejected_count) || 0)
    if (body.rejected_sample) {
      batch.set('rejected_sample', JSON.stringify(body.rejected_sample).slice(0, 19000))
    }
    $app.save(batch)

    let inserted = 0
    let updated = 0
    let failed = 0

    // normaliza o dia no formato do PocketBase ("AAAA-MM-DD 00:00:00.000Z") para que a
    // comparação de chave encontre o registro existente — sem isso a reimportação duplicaria
    const pbDay = (raw) => {
      const d = new Date(String(raw || '').replace(' ', 'T'))
      if (isNaN(d.getTime())) return ''
      return d.toISOString().replace('T', ' ')
    }

    // A confirmação NÃO confia em valor pré-calculado pelo cliente: recebe as linhas cruas e
    // aplica a mesma validação da prévia. Convertemos o investimento aqui para que a gravação
    // seja sempre correta, mesmo que o cliente envie apenas `spend`.
    const validPlatforms = ['google', 'meta', 'instagram', 'outro']
    const normalize = (r) => {
      const platform = String(r.platform || '').trim().toLowerCase()
      const account_id = String(r.account_id || '').trim()
      const campaign_id = String(r.campaign_id || '').trim()
      const currency = String(r.currency || '').trim().toUpperCase()
      const dayKey = pbDay(r.day)
      const spend = r.spend !== undefined ? r.spend : r.spend_cents !== undefined ? Number(r.spend_cents) / 100 : ''
      if (!validPlatforms.includes(platform)) return null
      if (!account_id || !campaign_id || !dayKey) return null
      if (!/^[A-Z]{3}$/.test(currency)) return null
      if (spend === '' || spend === null || spend === undefined) return null
      const cents = Math.round(Number(spend) * 100)
      if (isNaN(cents) || cents < 0) return null
      return {
        platform,
        account_id,
        account_name: String(r.account_name || '').trim(),
        campaign_id,
        campaign_name: String(r.campaign_name || '').trim(),
        day: dayKey,
        currency,
        spend_cents: cents,
        impressions: Number(r.impressions) >= 0 ? Math.round(Number(r.impressions)) : 0,
        clicks: Number(r.clicks) >= 0 ? Math.round(Number(r.clicks)) : 0,
        platform_leads: Number(r.platform_leads) >= 0 ? Math.round(Number(r.platform_leads)) : 0,
      }
    }

    for (const rawRow of rows) {
      const row = normalize(rawRow)
      if (!row) {
        failed++
        continue
      }
      try {
        const dayKey = row.day
        const found = $app.findRecordsByFilter(
          'media_daily',
          'platform = {:p} && account_id = {:a} && campaign_id = {:c} && day = {:d} && source_kind = "import"',
          '',
          1,
          0,
          { p: row.platform, a: row.account_id, c: row.campaign_id, d: dayKey },
        )
        if (found.length > 0) {
          // MESMA chave = atualiza, nunca soma. É o que impede dupla contagem.
          const rec = found[0]
          rec.set('spend_cents', Math.round(Number(row.spend_cents) || 0))
          rec.set('impressions', row.impressions || 0)
          rec.set('clicks', row.clicks || 0)
          rec.set('platform_leads', row.platform_leads || 0)
          rec.set('currency', row.currency)
          rec.set('import_batch', batch.id)
          if (row.account_name) rec.set('account_name', row.account_name)
          if (row.campaign_name) rec.set('campaign_name', row.campaign_name)
          $app.save(rec)
          updated++
        } else {
          const rec = new Record($app.findCollectionByNameOrId('media_daily'))
          rec.set('platform', row.platform)
          rec.set('account_id', row.account_id)
          rec.set('account_name', row.account_name || '')
          rec.set('campaign_id', row.campaign_id)
          rec.set('campaign_name', row.campaign_name || '')
          rec.set('day', dayKey)
          rec.set('currency', row.currency)
          rec.set('spend_cents', Math.round(Number(row.spend_cents) || 0))
          rec.set('impressions', row.impressions || 0)
          rec.set('clicks', row.clicks || 0)
          rec.set('platform_leads', row.platform_leads || 0)
          rec.set('source_kind', 'import')
          rec.set('import_batch', batch.id)
          $app.save(rec)
          inserted++
        }
      } catch (_) {
        failed++
      }
    }

    batch.set('rows_accepted', inserted + updated)
    $app.save(batch)

    return e.json(200, {
      batch_id: batch.id,
      inserted,
      updated,
      failed,
      accepted: inserted + updated,
    })
  },
  $apis.requireAuth(),
)
