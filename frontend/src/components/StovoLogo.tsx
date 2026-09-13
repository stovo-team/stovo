type StovoLogoProps = {
  className?: string;
  title?: string;
  size?: number | string;
  style?: React.CSSProperties;
};

const logoWebpSrcSet = "/Logo-48.webp 1x, /Logo-96.webp 2x, /Logo-192.webp 4x, /Logo-512.webp 8x";

export default function StovoLogo({ className, title = "Stovo logo", size, style }: StovoLogoProps) {
  return (
    <picture>
      <source srcSet={logoWebpSrcSet} type="image/webp" />
      <img
        alt={title}
        className={className}
        height={size}
        src="/Logo.svg"
        style={{ display: "block", maxWidth: "100%", maxHeight: "100%", ...style }}
        width={size}
      />
    </picture>
  );
}
