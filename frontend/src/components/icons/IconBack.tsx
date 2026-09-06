type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

export default function IconBack({ className, size = 18, title }: IconProps) {
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
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 12H4m6-6-6 6 6 6" />
    </svg>
  );
}
