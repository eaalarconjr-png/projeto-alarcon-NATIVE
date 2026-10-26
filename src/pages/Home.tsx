import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signOut } from '@/services/auth'

/**
 * Home da equipe (AL-F1-01): confirma quem entrou e deixa sair.
 * As próximas tarefas da fase 1 trazem aqui a lista de oportunidades e o funil.
 */
export default function HomePage() {
  const navigate = useNavigate()

  const handleSignOut = () => {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Alarcon Medical Center</CardTitle>
          <CardDescription>Você está autenticado na área da equipe</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-center text-sm text-muted-foreground">
            O ambiente de construção está pronto. As fichas de atendimento chegam nas próximas
            entregas da fase 1.
          </p>
          <Button variant="outline" onClick={handleSignOut}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
