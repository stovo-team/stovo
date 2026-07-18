type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

export default function IconStrikethrough({ className, size = 24, title }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-hidden={!title}
      aria-label={title}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 5.5A6.8 6.8 0 0 0 12.5 4C9.5 4 7 5.6 7 8c0 1.8 1.4 3 3.8 3.7M6.5 18.5A8 8 0 0 0 12 20c3.2 0 5.5-1.7 5.5-4.1 0-1.8-1.2-2.9-3.6-3.7M4 12h16" />
    </svg>
  );
}
