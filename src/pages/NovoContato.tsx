import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createContact,
  createOpportunity,
  findContactsByPhone,
  getContact,
  listTeam,
  type Contact,
  type ContactMatch,
  type Opportunity,
  type TeamMember,
} from '@/services/crm'

const ORIGINS = [
  { value: 'whatsapp', label: 'WhatsApp atual' },
  { value: 'site', label: 'Site' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'convenio_app', label: 'Aplicativo de convênio' },
  { value: 'outro', label: 'Outro' },
]

const MODALITIES = [
  { value: 'particular', label: 'Particular' },
  { value: 'convenio', label: 'Convênio' },
  { value: 'reembolso', label: 'Reembolso' },
]

/**
 * Cadastro manual de contato e abertura de oportunidade (AL-F1-02).
 * Pessoa é diferente de oportunidade: a mesma pessoa pode ter várias jornadas.
 * Correspondência por telefone vira revisão humana — nunca fusão automática.
 */
export default function NovoContatoPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [origin, setOrigin] = useState('site')
  const [interest, setInterest] = useState('')
  const [modality, setModality] = useState('particular')
  const [team, setTeam] = useState<TeamMember[]>([])
  const [owner, setOwner] = useState('')

  const [checking, setChecking] = useState(false)
  const [matches, setMatches] = useState<ContactMatch[] | null>(null)
  const [chosenContact, setChosenContact] = useState<Contact | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Opportunity | null>(null)

  useEffect(() => {
    listTeam()
      .then((members) => {
        setTeam(members)
        if (members.length > 0) setOwner(members[0].id)
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Não foi possível carregar a equipe.'),
      )
  }, [])

  const checkPhone = async () => {
    setError(null)
    setChecking(true)
    try {
      const found = await findContactsByPhone(phone)
      setMatches(found)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível verificar o telefone.')
    } finally {
      setChecking(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim() || phone.trim() === '' || !interest.trim() || !owner) {
      setError('Preencha nome, telefone, interesse e responsável.')
      return
    }
    setSaving(true)
    try {
      let contact = chosenContact
      if (!contact) {
        contact = await createContact({ name, phone, email, source_declared: origin })
      }
      const opportunity = await createOpportunity({
        contact: contact.id,
        interest,
        modality,
        owner,
        origin_declared: origin,
      })
      setCreated(opportunity)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const adoptExisting = async (id: string) => {
    setError(null)
    try {
      const contact = await getContact(id)
      setChosenContact(contact)
      setMatches(null)
      setName(contact.name)
      setPhone(contact.phone)
      setEmail(contact.email || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o contato existente.')
    }
  }

  const resetForm = () => {
    setCreated(null)
    setChosenContact(null)
    setMatches(null)
    setName('')
    setPhone('')
    setEmail('')
    setInterest('')
    setModality('particular')
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <Card>
          <CardHeader>
            <CardTitle>Oportunidade criada</CardTitle>
            <CardDescription>
              {name} — {interest}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              A oportunidade começou na etapa “Novo”. Você pode acompanhá-la na lista de
              oportunidades.
            </p>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/">Ir para as oportunidades</Link>
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Cadastrar outro contato
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Novo contato</CardTitle>
          <CardDescription>
            Cadastro manual: contato vindo do WhatsApp atual, site, indicação ou aplicativo de
            convênio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da pessoa"
                disabled={!!chosenContact}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone (WhatsApp) *</Label>
              <div className="flex gap-2">
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  disabled={!!chosenContact}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={checkPhone}
                  disabled={checking || !!chosenContact || phone.replace(/\D/g, '').length < 10}
                >
                  {checking ? 'Verificando…' : 'Verificar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Se o telefone já existir, o sistema mostra a correspondência para você decidir —
                nunca junta cadastros por conta própria.
              </p>
            </div>

            {matches && matches.length > 0 && !chosenContact && (
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="mb-2 font-medium">
                  Telefone já cadastrado — confirme antes de seguir:
                </p>
                {matches.map(({ contact }) => (
                  <div key={contact.id} className="flex items-center justify-between gap-2 py-1">
                    <span>
                      {contact.name} · {contact.phone}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => useExisting(contact.id)}
                    >
                      Usar este cadastro
                    </Button>
                  </div>
                ))}
                <p className="mt-2 text-xs text-muted-foreground">
                  Se não for a mesma pessoa, siga o cadastro abaixo — os dois registros ficam
                  separados para revisão.
                </p>
              </div>
            )}

            {chosenContact && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                Usando o cadastro existente de <strong>{chosenContact.name}</strong>. Uma nova
                oportunidade será aberta para esta pessoa.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@email.com"
                disabled={!!chosenContact}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="origin">Origem declarada *</Label>
              <select
                id="origin"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {ORIGINS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="interest">Interesse declarado *</Label>
              <Input
                id="interest"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                placeholder="Ex.: cirurgia de vesícula, hérnia…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modality">Modalidade</Label>
              <select
                id="modality"
                value={modality}
                onChange={(e) => setModality(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {MODALITIES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Ter convênio não elimina a jornada particular — as duas podem existir.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner">Responsável *</Label>
              {team.length === 0 ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <select
                  id="owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar contato e abrir oportunidade'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
