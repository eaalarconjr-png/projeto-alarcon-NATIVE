import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HeartPulse } from 'lucide-react'
import { signIn } from '@/services/auth'

/**
 * Tela de entrada da equipe (AL-F1-01).
 * Acesso: administrador, atendimento e gestor de tráfego (contas de demonstração).
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha para entrar.')
      return
    }
    setLoading(true)
    const { error: err } = await signIn(email.trim(), password)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-pink-300/30 blur-3xl"
        aria-hidden="true"
      />
      <Card className="relative w-full max-w-md rounded-[2rem] p-3 shadow-float">
        <CardHeader className="items-center space-y-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_22px_-8px_hsl(var(--primary)/0.7)]">
            <HeartPulse className="h-7 w-7" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">Alarcon Medical Center</CardTitle>
          <CardDescription>Acesse com a sua conta da equipe</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@alarcon.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
