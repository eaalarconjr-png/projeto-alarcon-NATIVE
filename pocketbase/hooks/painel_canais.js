// AL-F3-03: status da leitura conectada de cada canal.
// A SPEC é explícita: SEM acesso, o canal fica PENDENTE e os dados entram por importação.
// Não preencher zeros, não bloquear a fase, não inventar conexão. Esta rota devolve o estado
// real de cada canal lendo a presença da credencial no ambiente — nunca presume "conectado".
// Também registra a última sincronização e o erro, para que um canal quebrado não apague o
// último dado válido do outro (cada canal é independente).
routerAdd('GET', '/backend/v1/painel/canais', (e) => {
  const hasSecret = (key) => {
    try {
      const v = $secrets.get(key)
      return !!(v && String(v).trim().length > 0)
    } catch (_) {
      return false
    }
  }

  // Credenciais que uma integração REAL de leitura exigiria (nenhuma existe hoje).
  const channels = [
    {
      key: 'google',
      label: 'Google Ads',
      // developer token + OAuth de conta de anúncios em modo leitura
      credential_names: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID'],
      docs_hint:
        'Google Ads API: requer developer token aprovado, OAuth 2.0 com escopo de leitura e o customer ID da conta.',
    },
    {
      key: 'meta',
      label: 'Meta Ads',
      // token de usuário de sistema com ads_read
      credential_names: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'],
      docs_hint:
        'Meta Marketing API: requer token com permissão ads_read e o act_<id> da conta de anúncios.',
    },
    {
      key: 'instagram',
      label: 'Instagram',
      credential_names: [],
      docs_hint:
        'Anúncios do Instagram entram pela conta de anúncios da Meta, como posicionamento. Perfil orgânico não faz parte desta fase.',
    },
  ]

  const result = []
  for (const ch of channels) {
    const present = ch.credential_names.filter((n) => hasSecret(n))
    const missing = ch.credential_names.filter((n) => !hasSecret(n))
    let status = 'pendente'
    if (ch.credential_names.length === 0) {
      status = ch.key === 'instagram' ? 'via_meta' : 'pendente'
    } else if (missing.length === 0) {
      status = 'credencial_presente' // ainda exige validação da conta antes de sincronizar
    }
    result.push({
      platform: ch.key,
      label: ch.label,
      status,
      credentials_present: present,
      credentials_missing: missing,
      docs_hint: ch.docs_hint,
    })
  }

  // última sincronização/erro por canal (registrados quando a conexão existir)
  let syncState = {}
  try {
    const batches = $app.findRecordsByFilter('media_imports', '', '-created', 100, 0)
    for (const b of batches) {
      const p = b.getString('platform')
      if (!syncState[p]) {
        syncState[p] = {
          last_import_at: b.getString('created'),
          last_filename: b.getString('filename'),
          rows_accepted: b.getInt('rows_accepted', 0),
        }
      }
    }
  } catch (_) {}

  // JSVM não transpila spread ({...obj}) — monta o objeto campo a campo
  const withImports = []
  for (const c of result) {
    withImports.push({
      platform: c.platform,
      label: c.label,
      status: c.status,
      credentials_present: c.credentials_present,
      credentials_missing: c.credentials_missing,
      docs_hint: c.docs_hint,
      last_import: syncState[c.platform] || null,
    })
  }

  return e.json(200, {
    generated_at: new Date().toISOString(),
    read_only: true,
    channels: withImports,
    fallback: {
      available: true,
      how: 'Importação de CSV pelo painel (AL-F3-02) — funciona sem qualquer acesso de mídia.',
      note: 'Um canal sem credencial fica pendente; importação e painel seguem funcionando.',
    },
    guarantee:
      'Nenhum evento de paciente é enviado às plataformas de anúncio nesta fase. A integração, quando existir, será somente leitura.',
  })
}, $apis.requireAuth())
