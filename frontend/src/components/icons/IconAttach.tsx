type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

export default function IconAttach({ className, size = 24, title }: IconProps) {
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
      <path d="M8.5 14.5 15 8a3.5 3.5 0 0 1 5 5l-7 7a5 5 0 0 1-7-7l8-8" />
    </svg>
  );
}
