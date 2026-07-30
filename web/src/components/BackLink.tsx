import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from 'lucide-react'

/** A small "← back to X" link, placed above a nested page's content. */
export function BackLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start text-sm">
      <ArrowLeftIcon className="size-4" /> {children}
    </Link>
  )
}
