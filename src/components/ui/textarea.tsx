/* Textarea Component - A component that displays a textarea - from shadcn/ui (exposes Textarea) */
import * as React from 'react'

import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[88px] w-full rounded-2xl border border-input bg-muted/50 px-4 py-3 text-base transition-colors focus-visible:bg-card ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea }
