interface FaceProps {
  slug: string;
}

export function AgentFace({ slug }: FaceProps) {
  const shirt =
    slug === "amy" ? "#ff8fbe" : slug === "lily" ? "#b89bff" : slug === "ken" ? "#3d6f99" : slug === "ivy" ? "#f0b15a" : "#67c07a";
  const hair = slug === "lily" || slug === "ivy" ? "#3a2418" : slug === "maggie" ? "#6b3a28" : "#2a211c";
  return (
    <svg className="face" viewBox="0 0 72 80" aria-hidden="true">
      <ellipse cx="36" cy="74" rx="18" ry="6" fill="rgba(80,40,20,0.15)" />
      <path d="M22 46h28c2 10 2 18-2 24H24c-4-6-4-14-2-24z" fill={shirt} stroke="#4a3426" strokeWidth="2" />
      {slug === "ken" && <path d="M20 46h32v8H20z" fill="#24384a" />}
      <circle cx="36" cy="30" r="16" fill="#ffd7bf" stroke="#4a3426" strokeWidth="2" />
      {slug === "lily" ? (
        <path d="M20 30c0-16 8-24 16-24s16 8 16 24c2 8-2 14-6 16H26c-4-2-8-8-6-16z" fill={hair} />
      ) : slug === "ivy" ? (
        <>
          <path d="M22 28c0-14 6-20 14-20s14 6 14 20v4H22z" fill={hair} />
          <ellipse cx="36" cy="12" rx="10" ry="6" fill="#e45c4a" stroke="#4a3426" strokeWidth="2" />
        </>
      ) : slug === "maggie" ? (
        <>
          <path d="M22 32c0-16 6-22 14-22s14 6 14 22v2H22z" fill={hair} />
          <circle cx="52" cy="36" r="6" fill={hair} />
        </>
      ) : (
        <path d="M20 32c1-16 8-22 16-22s15 6 16 22c-4-4-8-6-16-6s-12 2-16 6z" fill={hair} />
      )}
      <circle cx="30" cy="32" r="1.6" fill="#3b291c" />
      <circle cx="42" cy="32" r="1.6" fill="#3b291c" />
      {(slug === "amy" || slug === "ken") && (
        <path d="M24 32h10M38 32h10M34 32h4" fill="none" stroke="#4a3426" strokeWidth="2" strokeLinecap="round" />
      )}
      <path d="M31 40c2 2 8 2 10 0" fill="none" stroke="#c46b6b" strokeWidth="1.6" strokeLinecap="round" />
      {slug === "amy" && <rect x="48" y="50" width="8" height="12" rx="2" fill="#fff" stroke="#4a3426" strokeWidth="1.5" />}
      {slug === "lily" && <circle cx="54" cy="18" r="5" fill="#ffe08a" stroke="#4a3426" strokeWidth="1.5" />}
      {slug === "ken" && <path d="M50 54h10l-2 8h-6z" fill="#d7ecff" stroke="#4a3426" strokeWidth="1.5" />}
      {slug === "ivy" && <rect x="48" y="52" width="12" height="9" rx="2" fill="#fff" stroke="#4a3426" strokeWidth="1.5" />}
      {slug === "maggie" && <rect x="46" y="50" width="12" height="14" rx="2" fill="#fffaf2" stroke="#4a3426" strokeWidth="1.5" />}
    </svg>
  );
}
