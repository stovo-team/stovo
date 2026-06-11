type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

export default function IconVideo({ className, size = 24, title }: IconProps) {
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
      <rect x="3.5" y="7" width="12" height="10" rx="2" />
      <path d="m15.5 10.5 5-3v9l-5-3v-3Z" />
    </svg>
  );
}
