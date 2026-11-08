import { Link } from 'react-router'

/** The MailBuds logo, linking to the landing page. Frosted like the newsletter rail. */
export default function BrandLink({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      aria-label="MailBuds home"
      className={`flex items-center gap-2 rounded-full transition-transform duration-200 hover:scale-[1.05] active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text motion-reduce:transition-none ${
        compact
          ? 'p-1'
          : 'border border-white/80 bg-white/55 py-2 pl-2.5 pr-4 shadow-[0_12px_30px_rgba(36,56,92,.16),inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-[26px] backdrop-saturate-[1.8]'
      } ${className}`}
    >
      <img
        src="/brand/mailbuds-m.svg"
        alt=""
        width={compact ? 40 : 32}
        height={compact ? 33 : 26}
        draggable={false}
        className={compact ? 'drop-shadow-[0_4px_10px_rgba(20,40,80,.35)]' : ''}
      />
      {!compact && <span className="text-[17px] font-extrabold tracking-[-0.01em] text-accent-text">MailBuds</span>}
    </Link>
  )
}
