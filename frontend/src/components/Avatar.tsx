import { gradientFor, initialOf } from '../lib/avatar'

const SIZES = { sm: 'size-7 text-[12px]', md: 'size-10 text-[16px]', lg: 'size-[72px] text-[28px]' }

/** Round gradient avatar, as in the globe prototype. Each person keeps the same colour everywhere. */
export default function Avatar({
  id,
  name,
  size = 'md',
  className = '',
}: {
  id: string
  name: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const [from, to] = gradientFor(id)
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-system font-bold text-white ${SIZES[size]} ${className}`}
      style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
    >
      {initialOf(name)}
    </span>
  )
}
