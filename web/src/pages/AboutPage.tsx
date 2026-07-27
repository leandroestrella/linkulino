import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon } from 'lucide-react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Mermaid } from '@/components/Mermaid'
// The repo-root README is the single source of truth; we render it verbatim.
// It lives above web/, so vite.config allows the dev server to read it.
import readme from '../../../README.md?raw'

/** True for links that leave the app (http/https or mailto). */
function isExternal(href: string) {
  return /^(https?:)?\/\//i.test(href) || href.startsWith('mailto:')
}

/**
 * Tailwind-styled element overrides for the README markdown. We don't use the
 * typography plugin (not installed under Tailwind v4), so each block is styled
 * by hand against the app's design tokens, and both themes are covered by them.
 */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-8 mb-3 text-3xl font-semibold lowercase tracking-tight first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 mb-3 border-b pb-1.5 text-xl font-semibold lowercase tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-lg font-semibold">{children}</h3>,
  p: ({ children }) => <p className="my-4 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-1.5 pl-6">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="text-muted-foreground border-primary/40 my-4 border-l-2 pl-4 italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) =>
    href && isExternal(href) ? (
      <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        {children}
      </a>
    ) : (
      // Repo-relative links (LICENSE, source paths) don't resolve in the deployed
      // SPA, so render them as plain emphasized text rather than dead links.
      <span className="font-medium">{children}</span>
    ),
  img: ({ src, alt, ...props }) => {
    // README image paths are repo-relative (assets/…); the SPA serves them from root.
    const resolved = typeof src === 'string' ? src.replace(/^assets\//, '/') : src
    return <img {...props} src={resolved} alt={alt ?? ''} className="my-4 max-w-full rounded-lg" />
  },
  code: ({ className, children }) => {
    // Render mermaid fences as actual diagrams rather than as their source.
    if (className?.includes('language-mermaid')) return <Mermaid chart={String(children)} />
    return className?.includes('language-') ? (
      // Fenced block (rendered inside <pre>): keep it plain, <pre> styles it.
      <code className={className}>{children}</code>
    ) : (
      <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
    )
  },
  pre: ({ children, node }) => {
    // A mermaid fence renders as a diagram (via the `code` override), so drop the
    // code-block chrome around it; other fences keep the styled <pre>.
    const child = node?.children?.[0]
    const cls =
      child?.type === 'element' && Array.isArray(child.properties?.className)
        ? (child.properties.className as string[])
        : []
    if (cls.includes('language-mermaid')) return <>{children}</>
    return (
      <pre className="bg-muted my-4 overflow-x-auto rounded-lg border p-4 text-sm leading-relaxed">
        {children}
      </pre>
    )
  },
  hr: () => <hr className="my-8" />,
}

export function AboutPage() {
  const { t } = useTranslation()
  return (
    <div className="flex w-full flex-col gap-6">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {t('nav.back')}
      </Link>
      <div className="text-foreground">
        {/* rehypeRaw renders the README's inline HTML (e.g. the leading <img>
            avatar) instead of escaping it to literal text. The source is our own
            bundled file, not user input, so reparsing raw HTML is safe here. */}
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
          {readme}
        </Markdown>
      </div>
    </div>
  )
}
