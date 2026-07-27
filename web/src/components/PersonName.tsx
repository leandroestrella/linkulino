import type { Participant } from '@/api/types'

/** True when an icon value is an image URL rather than a plain emoji. */
function isImageUrl(icon: string): boolean {
  return /^https?:\/\//i.test(icon)
}

/**
 * Finds a participant by name, case-insensitively — sheet free-text columns
 * (like "Pagato da") may not match the Users tab's casing exactly (e.g.
 * historical rows entered "Leandro" before the participant was named
 * "leandro" in Users). Falls back to a nameless-icon stand-in so callers
 * always get a renderable person.
 */
export function findParticipant(participants: Participant[], name: string): Participant {
  const lower = name.toLowerCase()
  return participants.find((p) => p.name.toLowerCase() === lower) ?? { name, icon: '' }
}

/** A participant's icon — an emoji rendered as text, or a small avatar when it's an image URL. */
export function PersonIcon({ icon }: { icon: string }) {
  if (!icon) return null
  if (isImageUrl(icon)) {
    return <img src={icon} alt="" className="inline-block size-4 align-[-3px]" />
  }
  return <span aria-hidden>{icon}</span>
}

/** A participant's name with their icon to the right — emoji or avatar, wherever a name is shown. */
export function PersonName({ person }: { person: { name: string; icon: string } }) {
  return (
    <span className="inline-flex items-center gap-1">
      {person.name}
      <PersonIcon icon={person.icon} />
    </span>
  )
}
