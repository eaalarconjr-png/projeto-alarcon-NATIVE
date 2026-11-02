import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createForm,
  deactivateForm,
  getLatestVersion,
  listForms,
  type FormRecord,
} from '@/services/forms'

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  desativado: 'Desativado',
}

/**
 * Lista de formulários (AL-F1-04): criar, editar, desativar.
 * A edição abre o editor em /formularios/:id.
 */
export default function FormulariosPage() {
  const [items, setItems] = useState<FormRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listForms())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os formulários.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async () => {
    if (newTitle.trim().length < 3) {
      setError('O título precisa ter pelo menos 3 letras.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const form = await createForm(newTitle)
      setDialogOpen(false)
      setNewTitle('')
      window.location.assign(`/formularios/${form.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o formulário.')
    } finally {
      setCreating(false)
    }
  }

  const handleDeactivate = async (form: FormRecord) => {
    if (!window.confirm(`Desativar "${form.title}"? O formulário deixa de receber respostas.`))
      return
    try {
      await deactivateForm(form.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível desativar.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Formulários</h1>
          <p className="text-sm text-muted-foreground">
            Perguntas com caminhos condicionais, versões publicadas e prévia
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>Novo formulário</Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum formulário ainda. Crie o primeiro para começar a captar respostas.
            </p>
            <Button onClick={() => setDialogOpen(true)}>Novo formulário</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <Card key={f.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{f.title}</CardTitle>
                <CardDescription>Status: {STATUS_LABELS[f.status] ?? f.status}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/formularios/${f.id}`}>Editar</Link>
                </Button>
                {f.status !== 'desativado' && (
                  <Button variant="ghost" size="sm" onClick={() => handleDeactivate(f)}>
                    Desativar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo formulário</DialogTitle>
            <DialogDescription>
              Dê um título. As perguntas e os caminhos você monta na próxima tela.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="form-title">Título</Label>
            <Input
              id="form-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex.: Primeiro contato — consulta"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Criando…' : 'Criar e editar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
