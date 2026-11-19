import { useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Loader2, Play, Plug, RefreshCcw, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  callMcpTool,
  getMcpState,
  regenerateToken,
  type McpState,
  type McpTool,
} from '@/services/admin'

const DEFAULT_ARGS: Record<string, string> = {
  list_collections: '',
  list_records: '{\n  "collection": "opportunities",\n  "per_page": 5\n}',
  get_record: '{\n  "collection": "opportunities",\n  "id": "ID_DO_REGISTRO"\n}',
}

/** Seção MCP do painel admin: ferramentas, credencial e playground JSON-RPC. */
export default function AdminMcp() {
  const [state, setState] = useState<McpState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'url' | 'token' | null>(null)
  const [rotating, setRotating] = useState(false)

  const [selectedTool, setSelectedTool] = useState<string>('')
  const [argsText, setArgsText] = useState('')
  const [rpcResponse, setRpcResponse] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    getMcpState()
      .then((s) => {
        setState(s)
        if (!selectedTool && s.tools.length) selectTool(s.tools[0])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectTool = (tool: McpTool) => {
    setSelectedTool(tool.name)
    setArgsText(DEFAULT_ARGS[tool.name] ?? '{\n  \n}')
    setRpcResponse(null)
  }

  const copy = async (text: string, which: 'url' | 'token') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setError('Não foi possível copiar.')
    }
  }

  const rotate = async () => {
    setRotating(true)
    setError(null)
    try {
      await regenerateToken()
      const s = await getMcpState()
      setState(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao regenerar token.')
    } finally {
      setRotating(false)
    }
  }

  const runTool = async () => {
    if (!state) return
    setRunning(true)
    setError(null)
    setRpcResponse(null)
    try {
      let args: unknown = {}
      if (argsText.trim()) {
        args = JSON.parse(argsText)
      }
      const res = await callMcpTool(state.endpoint_url, state.token, 'tools/call', {
        name: selectedTool,
        arguments: args,
      })
      setRpcResponse(JSON.stringify(res, null, 2))
    } catch (e) {
      setRpcResponse(
        JSON.stringify(
          {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: e instanceof Error ? e.message : 'Erro de JSON nos argumentos.',
            },
          },
          null,
          2,
        ),
      )
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!state) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-4 text-sm text-destructive" role="alert">
          {error ?? 'Não foi possível carregar a configuração MCP.'}
        </CardContent>
      </Card>
    )
  }

  const tokenVisible = state.token

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Plug className="h-5 w-5 text-primary" aria-hidden="true" />
          MCP — Servidor de ferramentas
        </h1>
        <p className="text-sm text-muted-foreground">
          Endpoint JSON-RPC 2.0 que expõe os dados do app para clientes MCP (Claude, Cursor…).
        </p>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-4 text-sm text-destructive" role="alert">
            {error}
          </CardContent>
        </Card>
      )}

      {/* (b) URL do endpoint + token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Endpoint e credencial
          </CardTitle>
          <CardDescription>
            Autenticação própria do app (header Authorization: Bearer). Sem OAuth externo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>URL do endpoint</Label>
            <div className="flex gap-2">
              <Input readOnly value={state.endpoint_url} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(state.endpoint_url, 'url')}
                aria-label="Copiar URL"
              >
                {copied === 'url' ? (
                  <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Token de API</Label>
            <div className="flex gap-2">
              <Input readOnly value={tokenVisible} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(tokenVisible, 'token')}
                aria-label="Copiar token"
              >
                {copied === 'token' ? (
                  <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
              <Button variant="outline" onClick={rotate} disabled={rotating}>
                {rotating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Regenerar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {state.enabled ? 'Ativo. ' : 'Inativo — clique em Regenerar para ativar. '}
              {state.call_count > 0 &&
                `${state.call_count} chamada(s) registrada(s), última em ${state.last_call_at || '—'}.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* (a) ferramentas expostas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" aria-hidden="true" />
            Ferramentas disponíveis ({state.tools.length})
          </CardTitle>
          <CardDescription>O que o servidor MCP expõe sobre os dados do app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.tools.map((t) => (
            <div key={t.name} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-sm font-semibold">{t.name}</p>
                <Button variant="ghost" size="sm" onClick={() => selectTool(t)}>
                  Testar
                </Button>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* (c) playground */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="h-4 w-4" aria-hidden="true" />
            Playground
          </CardTitle>
          <CardDescription>
            Escolha a ferramenta, preencha os argumentos em JSON e veja a resposta JSON-RPC 2.0.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-tool">Ferramenta</Label>
              <select
                id="mcp-tool"
                value={selectedTool}
                onChange={(e) => {
                  const t = state.tools.find((x) => x.name === e.target.value)
                  if (t) selectTool(t)
                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {state.tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-args">Argumentos (JSON)</Label>
              <Textarea
                id="mcp-args"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                rows={8}
                className="font-mono text-xs"
                placeholder="{}"
              />
            </div>
            <Button onClick={runTool} disabled={running || !selectedTool} className="w-full">
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              Executar
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Resposta JSON-RPC</Label>
            <pre className="max-h-96 overflow-auto rounded-xl bg-muted/60 p-4 font-mono text-xs leading-relaxed">
              {rpcResponse ?? '—'}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
