// task AL-F1-02: dados de contatos e oportunidades — só o serviço fala com o SDK
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export interface Contact {
  id: string
  name: string
  phone: string
  email: string
  source_declared: string
  created: string
}

export interface Opportunity {
  id: string
  contact: string
  interest: string
  modality: string
  owner: string
  stage: string
  status: string
  close_reason: string
  next_step: string
  next_step_at: string
  origin_declared: string
  origin_captured: string
  created: string
  updated: string
}

/** Apenas dígitos (SPEC: telefone normalizado). */
export const normalizePhone = (raw: string): string => raw.replace(/\D/g, '')

export interface ContactMatch {
  contact: Contact
}

/**
 * Procura contato pelo telefone normalizado. Telefone compartilhado ou nome
 * semelhante NÃO autoriza fusão: a correspondência vira revisão humana na tela.
 */
export const findContactsByPhone = async (rawPhone: string): Promise<ContactMatch[]> => {
  const phone = normalizePhone(rawPhone)
  if (phone.length < 10) return []
  const list = await pb.collection('contacts').getList(1, 10, {
    filter: pb.filter('phone = {:p}', { p: phone }),
  })
  return list.items.map((c) => ({ contact: c as unknown as Contact }))
}

export const createContact = async (data: {
  name: string
  phone: string
  email?: string
  source_declared?: string
}): Promise<Contact> => {
  try {
    const rec = await pb.collection('contacts').create({
      name: data.name.trim(),
      phone: normalizePhone(data.phone),
      email: data.email?.trim() || '',
      source_declared: data.source_declared || '',
    })
    return rec as unknown as Contact
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const getContact = async (id: string): Promise<Contact> => {
  try {
    return (await pb.collection('contacts').getOne(id)) as unknown as Contact
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface TeamMember {
  id: string
  name: string
  role: string
}

export const listTeam = async (): Promise<TeamMember[]> => {
  try {
    const list = await pb.collection('users').getList(1, 50, { sort: 'name' })
    return list.items.map((u) => ({
      id: u.id,
      name: (u.name as string) || 'Sem nome',
      role: (u.role as string) || '',
    }))
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface OpportunityInput {
  contact: string
  interest: string
  modality: string
  owner: string
  origin_declared?: string
}

export const createOpportunity = async (data: OpportunityInput): Promise<Opportunity> => {
  try {
    const rec = await pb.collection('opportunities').create({
      contact: data.contact,
      interest: data.interest.trim(),
      modality: data.modality || '',
      owner: data.owner,
      stage: 'novo',
      status: 'aberta',
      origin_declared: data.origin_declared || 'nao_identificado',
    })
    return rec as unknown as Opportunity
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface OpportunityFilters {
  stage?: string
  owner?: string
  origin?: string
}

export const listOpportunities = async (
  filters: OpportunityFilters = {},
): Promise<Opportunity[]> => {
  try {
    const conditions: string[] = []
    const params: Record<string, string> = {}
    if (filters.stage) {
      conditions.push('stage = {:s}')
      params.s = filters.stage
    }
    if (filters.owner) {
      conditions.push('owner = {:o}')
      params.o = filters.owner
    }
    if (filters.origin) {
      conditions.push('origin_declared = {:g}')
      params.g = filters.origin
    }
    const filter = conditions.length ? pb.filter(conditions.join(' && '), params) : undefined
    const list = await pb.collection('opportunities').getList(1, 100, {
      filter,
      sort: '-updated',
      expand: 'contact,owner',
    })
    return list.items as unknown as Opportunity[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const getOpportunity = async (id: string): Promise<Opportunity> => {
  try {
    return (await pb
      .collection('opportunities')
      .getOne(id, { expand: 'contact,owner' })) as unknown as Opportunity
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface HistoryEntry {
  id: string
  from_stage: string
  to_stage: string
  author: string
  note: string
  created: string
  expand?: { author?: { name: string } }
}

export const getStageHistory = async (opportunityId: string): Promise<HistoryEntry[]> => {
  try {
    const list = await pb.collection('stage_history').getList(1, 50, {
      filter: pb.filter('opportunity = {:o}', { o: opportunityId }),
      sort: '-created',
      expand: 'author',
    })
    return list.items as unknown as HistoryEntry[]
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
