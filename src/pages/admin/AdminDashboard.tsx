import { useEffect, useState } from 'react'
import { Database, Loader2, Table2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listCollectionsWithCount, type CollectionInfo } from '@/services/admin'

/**
 * Dashboard do painel admin: lista as coleções do banco com a contagem de
 * registros (dados reais, vindos da rota /backend/v1/mcp/state).
 */
export default function AdminDashboard() {
  const [collections, setCollections] = useState<CollectionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listCollectionsWithCount()
      .then(setCollections)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false))
  }, [])

  const totalRecords = collections.reduce((acc, c) => acc + c.records, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral das coleções do banco (dados reais do PocketBase).
        </p>
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-4 text-sm text-destructive" role="alert">
            {error}
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Table2 className="h-4 w-4" aria-hidden="true" />
                  Coleções
                </CardDescription>
                <CardTitle className="text-3xl">{collections.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Database className="h-4 w-4" aria-hidden="true" />
                  Registros (total)
                </CardDescription>
                <CardTitle className="text-3xl">{totalRecords}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coleções e contagem de registros</CardTitle>
              <CardDescription>
                A contagem vem direto do banco (query COUNT por coleção, sem cache).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coleção</TableHead>
                    <TableHead className="text-right">Registros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell className="font-mono text-sm">{c.name}</TableCell>
                      <TableCell className="text-right font-semibold">{c.records}</TableCell>
                    </TableRow>
                  ))}
                  {collections.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" aria-hidden="true" />
                        Nenhuma coleção exposta.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
