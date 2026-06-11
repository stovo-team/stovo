type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

export default function IconStorage({ className, size = 24, title }: IconProps) {
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
      <path d="M4 8.5 12 5l8 3.5v7L12 19l-8-3.5v-7Z" />
      <path d="M12 8.5v10.5M4 8.5l8 3.5 8-3.5" />
    </svg>
  );
}
