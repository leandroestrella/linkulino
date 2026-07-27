import { createContext, useContext } from 'react'

/**
 * A slot inside the sticky header that pages can fill (via a portal) so their
 * own toolbar — e.g. the home page's "add expense" button and totals card —
 * anchors together with the brand row as a single sticky header. Holds the
 * slot's DOM node, or null before mount.
 */
export const SubHeaderContext = createContext<HTMLElement | null>(null)

/** The sticky-header slot element to portal page toolbar content into. */
export function useSubHeaderContainer(): HTMLElement | null {
  return useContext(SubHeaderContext)
}
