import { ChevronLeft, ChevronRight } from "lucide-react";

interface SidebarCollapseButtonProps {
  expanded: boolean;
  expandLabel: string;
  collapseLabel: string;
  onToggle: () => void;
  className?: string;
  hidden?: boolean;
}

export function SidebarCollapseButton({
  expanded,
  expandLabel,
  collapseLabel,
  onToggle,
  className = "",
  hidden = false,
}: SidebarCollapseButtonProps) {
  return (
    <button
      type="button"
      className={`sidebar-collapse-button${className ? ` ${className}` : ""}`}
      hidden={hidden}
      aria-label={expanded ? collapseLabel : expandLabel}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {expanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );
}
