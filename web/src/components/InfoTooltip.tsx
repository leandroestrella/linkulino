import { InfoIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** A small (i) icon that reveals an explanation of how an adjacent calculated value was derived. */
export function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger aria-label="explanation">
        <InfoIcon className="text-muted-foreground size-3" />
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-center">{children}</TooltipContent>
    </Tooltip>
  )
}
