import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeartPulse, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn, getCurrentUser } from '@/services/auth'

/** Login exclusivo do painel admin (usa a auth do PocketBase, papel admin). */
export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    const user = getCurrentUser()
    if (user && user.role === 'admin') {
      navigate('/admin', { replace: true })
      return
    }
    setError('Este painel é exclusivo do administrador.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <HeartPulse className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2 text-lg">
            <LockKeyhole className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Painel Admin — Alarcon
          </CardTitle>
          <CardDescription>Acesso exclusivo do administrador (auth PocketBase)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="admin-email">E-mail</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@alarcon.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin-password">Senha</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
