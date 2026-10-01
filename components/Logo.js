export function LogoMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
      <path d="M6 14h12l14 26 14-26h12L36 54h-8z" />
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo-text">
        <span className="logo-vanta">VANTA</span>
        <span className="logo-motors">MOTORS</span>
      </span>
    </span>
  );
}
