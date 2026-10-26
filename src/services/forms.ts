// task AL-F1-04: dados de formulários e versões — só o serviço fala com o SDK.
// Esquema de uma versão (imutável quando publicada):
// { questions: [{ id, label, type: 'texto'|'telefone'|'escolha', required, options?: [{id,label}],
//                 jumps?: { [optionId]: 'pergunta:<id>' | 'fim' } }] }
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { getCurrentUser } from '@/services/auth'

export type QuestionType = 'texto' | 'telefone' | 'escolha'

export interface QuestionOption {
  id: string
  label: string
}

export interface FormQuestion {
  id: string
  label: string
  type: QuestionType
  required: boolean
  options?: QuestionOption[]
  /** resposta igual à alternativa -> próxima pergunta ou encerramento */
  jumps?: Record<string, 'pergunta' | 'fim' | string>
}

export interface FormSchema {
  questions: FormQuestion[]
}

export interface FormRecord {
  id: string
  title: string
  status: 'rascunho' | 'publicado' | 'desativado'
  created: string
  updated: string
  expand?: { latest_version?: FormVersion }
}

export interface FormVersion {
  id: string
  form: string
  version_number: number
  schema: FormSchema
  status: 'rascunho' | 'publicada' | 'desativada'
  published_at: string
  created: string
}

export const listForms = async (): Promise<FormRecord[]> => {
  try {
    const list = await pb.collection('forms').getList(1, 50, { sort: '-updated' })
    return list.items as unknown as FormRecord[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const getForm = async (id: string): Promise<FormRecord> => {
  try {
    return (await pb.collection('forms').getOne(id)) as unknown as FormRecord
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const createForm = async (title: string): Promise<FormRecord> => {
  try {
    const rec = await pb.collection('forms').create({ title: title.trim(), status: 'rascunho' })
    return rec as unknown as FormRecord
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const listVersions = async (formId: string): Promise<FormVersion[]> => {
  try {
    const list = await pb.collection('form_versions').getList(1, 50, {
      filter: pb.filter('form = {:f}', { f: formId }),
      sort: '-version_number',
    })
    return list.items as unknown as FormVersion[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const getLatestVersion = async (formId: string): Promise<FormVersion | null> => {
  const versions = await listVersions(formId)
  return versions[0] ?? null
}

export const saveDraftVersion = async (
  formId: string,
  schema: FormSchema,
): Promise<FormVersion> => {
  try {
    const latest = await getLatestVersion(formId)
    // rascunho da última versão é atualizado; versão publicada nunca é editada
    if (latest && latest.status === 'rascunho') {
      const rec = await pb.collection('form_versions').update(latest.id, {
        schema: JSON.stringify(schema),
      })
      return rec as unknown as FormVersion
    }
    const author = getCurrentUser()?.id
    const rec = await pb.collection('form_versions').create({
      form: formId,
      version_number: (latest?.version_number ?? 0) + 1,
      schema: JSON.stringify(schema),
      status: 'rascunho',
    })
    void author
    return rec as unknown as FormVersion
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/** Publicar gera versão nova: alterações nunca reinterpretam respostas antigas. */
export const publishVersion = async (formId: string, schema: FormSchema): Promise<FormVersion> => {
  try {
    const author = getCurrentUser()?.id
    const latest = await getLatestVersion(formId)
    const rec = await pb.collection('form_versions').create({
      form: formId,
      version_number: (latest?.version_number ?? 0) + 1,
      schema: JSON.stringify(schema),
      status: 'publicada',
      published_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      published_by: author,
    })
    await pb.collection('forms').update(formId, { status: 'publicado' })
    return rec as unknown as FormVersion
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const deactivateForm = async (formId: string): Promise<void> => {
  try {
    await pb.collection('forms').update(formId, { status: 'desativado' })
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

/** Validação do esquema: saltos apontam para perguntas existentes e não formam ciclo. */
export const validateSchema = (schema: FormSchema): string | null => {
  if (!schema.questions.length) return 'Adicione ao menos uma pergunta.'
  const ids = new Set(schema.questions.map((q) => q.id))
  for (const q of schema.questions) {
    if (!q.label.trim()) return 'Toda pergunta precisa de um texto.'
    if (q.type === 'escolha' && (!q.options || q.options.length < 2)) {
      return `A pergunta "${q.label}" precisa de ao menos duas alternativas.`
    }
    for (const opt of q.options ?? []) {
      const target = q.jumps?.[opt.id]
      if (target === 'fim') continue
      if (target && target !== 'pergunta') {
        if (!ids.has(target))
          return `O salto de "${q.label}" aponta para uma pergunta que não existe.`
      }
    }
  }
  // ciclo: seguir saltos a partir de cada pergunta deve terminar (fim ou pergunta sem salto)
  for (const start of schema.questions) {
    const visited = new Set<string>()
    let current: FormQuestion | undefined = start
    while (current) {
      if (visited.has(current.id))
        return `As regras de salto formam um ciclo em "${current.label}".`
      visited.add(current.id)
      const jumpOpt = current.options?.find(
        (o) => current?.jumps?.[o.id] && current.jumps[o.id] !== 'fim',
      )
      const target = jumpOpt ? current.jumps?.[jumpOpt.id] : undefined
      if (!target || target === 'pergunta') break
      current = schema.questions.find((q) => q.id === target)
    }
  }
  return null
}

/** Simulação da jornada de respostas (prévia): retorna a ordem de perguntas visitadas. */
export const previewPath = (schema: FormSchema, answers: Record<string, string>): string[] => {
  const path: string[] = []
  let current: FormQuestion | undefined = schema.questions[0]
  const guard = new Set<string>()
  while (current && !guard.has(current.id)) {
    guard.add(current.id)
    path.push(current.id)
    const chosen = answers[current.id]
    const opt = current.options?.find((o) => o.id === chosen)
    const target = opt ? current.jumps?.[opt.id] : undefined
    if (!target || target === 'pergunta') {
      current = schema.questions[schema.questions.indexOf(current) + 1]
    } else if (target === 'fim') {
      break
    } else {
      current = schema.questions.find((q) => q.id === target)
    }
  }
  return path
}
