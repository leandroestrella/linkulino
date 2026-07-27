import { createContext, useContext } from 'react'

/**
 * A slot inside the sticky header that pages can fill (via a portal) so their
 * own toolbar — e.g. the home page's totals card — anchors together with the
 * brand row as a single sticky header. Holds the slot's DOM node, or null
 * before mount.
 */
export const SubHeaderContext = createContext<HTMLElement | null>(null)

/** The sticky-header slot element to portal page toolbar content into. */
export function useSubHeaderContainer(): HTMLElement | null {
  return useContext(SubHeaderContext)
}

/**
 * A slot on the same line as the header's sign-in status (AuthBar) that pages
 * fill with their write-gated admin button — e.g. "add expense", "new trip" —
 * so it always sits next to the login control/logged-in user details.
 */
export const AdminSlotContext = createContext<HTMLElement | null>(null)

/** The header's admin-button slot element to portal a page's write action into. */
export function useAdminSlotContainer(): HTMLElement | null {
  return useContext(AdminSlotContext)
}
