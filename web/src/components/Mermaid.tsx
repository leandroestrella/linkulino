import { useEffect, useState } from 'react'

/**
 * Renders a mermaid diagram from its source. `mermaid` is a heavy dependency, so
 * it's dynamically imported — it only loads when a page actually shows a diagram
 * (currently just the About page's README architecture chart), staying out of the
 * main bundle. Renders nothing until the SVG is ready, and silently on parse error.
 */
export function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let cancelled = false
    // Strip any embedded `%%{init: …}%%` directive (e.g. a hard-coded dark theme)
    // so the diagram picks up the neutral theme that suits the light About page.
    const source = chart.replace(/%%\{[\s\S]*?\}%%/g, '').trim()

    import('mermaid')
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' })
        const id = `mermaid-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, source)
        if (!cancelled) setSvg(svg)
      })
      .catch(() => {
        /* Leave the diagram blank rather than crashing the page on a bad chart. */
      })

    return () => {
      cancelled = true
    }
  }, [chart])

  if (!svg) return null
  return (
    <div
      className="my-6 flex justify-center overflow-x-auto"
      // The SVG is mermaid's own output for a chart from our bundled README —
      // no user input reaches it, and mermaid runs with securityLevel 'strict'.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
