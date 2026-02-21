interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
  showText?: boolean;
}

const sizeMap = {
  sm: { w: 140, h: 48, sub: 'text-[6.5px]' },
  md: { w: 180, h: 60, sub: 'text-[8px]' },
  lg: { w: 260, h: 88, sub: 'text-[12px]' },
};

export function Logo({ size = 'md', variant = 'dark', showText = true }: LogoProps) {
  const s = sizeMap[size];
  const main = variant === 'light' ? '#ffffff' : '#1e3a8a';
  const accent = variant === 'light' ? '#fbbf24' : '#f59e0b';
  const subtle = variant === 'light' ? 'rgba(255,255,255,0.35)' : 'rgba(30,58,138,0.2)';
  const textColor = variant === 'light' ? 'text-white/70' : 'text-slate-500';
  const font = "'Montserrat', sans-serif";
  const uid = `logo-${size}-${variant}`;

  const gProps = {
    fontFamily: font,
    fontWeight: 900 as const,
    fontStyle: 'italic' as const,
    fontSize: 76,
    fill: main,
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg
        width={s.w}
        height={s.h}
        viewBox="0 0 340 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Top half clip - used to show G on top of S in the upper zone */}
          <clipPath id={`${uid}-top`}>
            <rect x="0" y="0" width="170" height="58" />
          </clipPath>
          {/* Bottom half clip - used to show S on top of G in the lower zone */}
          <clipPath id={`${uid}-bot`}>
            <rect x="0" y="58" width="170" height="52" />
          </clipPath>
        </defs>

        {/* ── Store roof / awning ── */}
        <path
          d="M8 30 L22 10 L148 10 L162 30"
          stroke={main}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 30 L162 30" stroke={main} strokeWidth="4" strokeLinecap="round" />
        <path
          d="M8 30 Q20 42 33 30 Q46 42 59 30 Q72 42 85 30 Q98 42 111 30 Q124 42 137 30 Q150 42 162 30"
          stroke={main}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/*
          Chain interleave effect:
          Layer 1: Full S (back)
          Layer 2: Full G (middle) 
          Layer 3: S bottom-half only (front) - S passes OVER G at the bottom
        */}

        {/* Layer 1: S full (behind G) */}
        <text x="88" y="92" {...gProps}>S</text>

        {/* Layer 2: G full (over S) */}
        <text x="28" y="92" {...gProps}>G</text>

        {/* Layer 3: S bottom only (over G) - creates the chain interleave */}
        <g clipPath={`url(#${uid}-bot)`}>
          <text x="88" y="92" {...gProps}>S</text>
        </g>

        {/* Layer 4: G top only (over S) - reinforces the top interleave */}
        <g clipPath={`url(#${uid}-top)`}>
          <text x="28" y="92" {...gProps}>G</text>
        </g>

        {/* ── Divider line ── */}
        <line x1="178" y1="18" x2="178" y2="100" stroke={subtle} strokeWidth="2" />

        {/* ── Shopping bag icon ── */}
        <rect x="194" y="48" width="30" height="28" rx="3" stroke={main} strokeWidth="3.5" fill="none" />
        <path d="M201 48 L201 42 Q201 34 209 34 Q217 34 217 42 L217 48" stroke={main} strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="209" cy="62" r="2.5" fill={accent} />

        {/* ── Bar chart icon ── */}
        <rect x="238" y="62" width="8" height="14" rx="1.5" fill={subtle} />
        <rect x="250" y="52" width="8" height="24" rx="1.5" fill={subtle} />
        <rect x="262" y="42" width="8" height="34" rx="1.5" fill={main} opacity="0.7" />

        {/* ── Growth arrow ── */}
        <path
          d="M240 58 L254 46 L268 36"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M261 34 L270 34 L270 43"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* ── Inventory boxes ── */}
        <rect x="194" y="20" width="14" height="14" rx="2" stroke={main} strokeWidth="2.5" fill="none" opacity="0.5" />
        <rect x="212" y="20" width="14" height="14" rx="2" stroke={main} strokeWidth="2.5" fill="none" opacity="0.5" />
        <rect x="203" y="8" width="14" height="14" rx="2" stroke={main} strokeWidth="2.5" fill={accent} opacity="0.3" />

        {/* ── FCFA coin ── */}
        <circle cx="293" cy="86" r="7" stroke={accent} strokeWidth="2.5" fill="none" />
        <circle cx="307" cy="79" r="7" stroke={accent} strokeWidth="2.5" fill="none" opacity="0.4" />
        <text x="290" y="90" fontSize="9" fontWeight="800" fill={accent} fontFamily={font}>F</text>
      </svg>

      {showText && (
        <span
          className={`font-semibold uppercase ${textColor} ${s.sub}`}
          style={{
            textAlign: 'center',
            display: 'block',
            fontFamily: font,
            letterSpacing: '0.18em',
          }}
        >
          GestionStore
        </span>
      )}
    </div>
  );
}
