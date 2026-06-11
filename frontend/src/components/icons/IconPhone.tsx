type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

export default function IconPhone({ className, size = 24, title }: IconProps) {
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
      <path d="M8.5 5.5c.5 3.5 2.2 6.8 4.8 9.4s5.9 4.3 9.4 4.8l1.8-3.6a1 1 0 0 0-.3-1.1l-2.8-2.1a1 1 0 0 0-1.2.1l-1.4 1.1a11.5 11.5 0 0 1-5.1-5.1l1.1-1.4a1 1 0 0 0 .1-1.2L9.7 5.8a1 1 0 0 0-1.1-.3L5 7.3Z" />
    </svg>
  );
}
