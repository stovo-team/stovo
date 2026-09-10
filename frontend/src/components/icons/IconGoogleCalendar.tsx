export function IconGoogleCalendar({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#4285F4" />
      <path d="M3 8h18v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z" fill="#fff" />
      <path d="M3 8h18v3H3V8Z" fill="#34A853" />
      <path d="M7 3h3v5H7V3Z" fill="#EA4335" />
      <path d="M14 3h3v5h-3V3Z" fill="#FBBC04" />
      <text x="12" y="18" fill="#4285F4" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700" textAnchor="middle">31</text>
    </svg>
  );
}
