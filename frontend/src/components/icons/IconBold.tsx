type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

export default function IconBold({ className, size = 24, title }: IconProps) {
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
      <path d="M7 4h5.5a4 4 0 0 1 0 8H7V4Z" />
      <path d="M7 12h6a4 4 0 0 1 0 8H7v-8Z" />
    </svg>
  );
}
