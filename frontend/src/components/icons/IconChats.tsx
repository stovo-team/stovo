type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

export default function IconChats({ className, size = 24, title }: IconProps) {
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
      <path d="M5 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6.5L7 20v-3H8a3 3 0 0 1-3-3V7Z" />
      <path d="M9 10.5h6M9 13.5h4" />
    </svg>
  );
}
