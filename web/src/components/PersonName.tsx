/** True when an icon value is an image URL rather than a plain emoji. */
function isImageUrl(icon: string): boolean {
  return /^https?:\/\//i.test(icon)
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
