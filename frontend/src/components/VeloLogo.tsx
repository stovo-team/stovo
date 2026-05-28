type VeloLogoProps = {
  className?: string;
  title?: string;
};

export default function VeloLogo({ className, title = "Velo logo" }: VeloLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id="roseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#e11d48", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "#fb923c", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <rect
        x="15"
        y="32"
        width="45"
        height="10"
        rx="5"
        fill="url(#roseGrad)"
        transform="rotate(-25 37.5 37)"
      />
      <rect
        x="25"
        y="52"
        width="60"
        height="10"
        rx="5"
        fill="url(#roseGrad)"
        transform="rotate(-25 55 57)"
      />
      <rect
        x="45"
        y="72"
        width="35"
        height="10"
        rx="5"
        fill="url(#roseGrad)"
        transform="rotate(-25 62.5 77)"
      />
    </svg>
  );
}
