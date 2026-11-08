import { useState } from 'react'
import { gradientFor, initialOf } from '../lib/avatar'

const SIZES = { sm: 'size-7 text-[12px]', md: 'size-10 text-[16px]', lg: 'size-[72px] text-[28px]' }

/**
 * Round avatar: the person's photo when they have one, otherwise their initial on a gradient
 * (each person keeps the same colours everywhere). A photo that fails to load falls back to initials.
 */
export default function Avatar({
  id,
  name,
  size = 'md',
  className = '',
  src,
}: {
  id: string
  name: string
  size?: keyof typeof SIZES
  className?: string
  src?: string | null
}) {
  const [from, to] = gradientFor(id)
  const [failed, setFailed] = useState<string | null>(null)
  const showPhoto = Boolean(src) && failed !== src
  return (
    <span
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-system font-bold text-white ${SIZES[size]} ${className}`}
      style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
    >
      {initialOf(name)}
      {showPhoto && (
        <img
          src={src!}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(src!)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  )
}
