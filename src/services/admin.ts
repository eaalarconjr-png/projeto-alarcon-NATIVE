// Painel admin + MCP (nov/2026): serviço do painel admin e da seção MCP.
// Regra do projeto: só o serviço fala com o SDK / rotas customizadas.
// As rotas /backend/v1/mcp/* exigem sessão de admin (PocketBase auth) — o
// endpoint MCP em si usa o token próprio do app (sem OAuth externo).
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { getCurrentUser, type TeamUser } from '@/services/auth'

export interface CollectionInfo {
  name: string
  records: number
}

export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, { type?: string; description?: string }>
    required?: string[]
  }
}

export interface McpState {
  endpoint_url: string
  token: string
  token_hint: string
  token_rotated_at: string
  enabled: boolean
  last_call_at: string
  call_count: number
  collections: CollectionInfo[]
  tools: McpTool[]
}

const requireAdmin = (): TeamUser => {
  const user = getCurrentUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente para continuar.')
  if (user.role !== 'admin') throw new Error('Apenas o administrador acessa o painel admin.')
  return user
}

export const listCollectionsWithCount = async (): Promise<CollectionInfo[]> => {
  requireAdmin()
  try {
    const res = await pb.send('/backend/v1/mcp/state', { method: 'GET' })
    return (res as unknown as McpState).collections
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const getMcpState = async (): Promise<McpState> => {
  requireAdmin()
  try {
    const res = await pb.send('/backend/v1/mcp/state', { method: 'GET' })
    return res as unknown as McpState
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export const regenerateToken = async (): Promise<{ token: string; token_hint: string }> => {
  requireAdmin()
  try {
    const res = await pb.send('/backend/v1/mcp/regenerar-token', { method: 'POST' })
    return res as unknown as { token: string; token_hint: string }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export interface McpRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string }
}

/**
 * Chama o endpoint MCP com o token salvo (do estado atual do painel).
 * Playground da tela MCP usa isto para executar a ferramenta escolhida.
 */
export const callMcpTool = async (
  endpointUrl: string,
  token: string,
  method: string,
  params?: unknown,
): Promise<McpRpcResponse> => {
  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params: params ?? {},
      }),
    })
    const json = (await res.json()) as McpRpcResponse
    return json
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Falha na chamada MCP: ${error.message}`
        : 'Falha na chamada MCP (resposta não é JSON válido).',
    )
  }
}
