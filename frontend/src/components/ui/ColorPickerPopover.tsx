import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import "./ColorPickerPopover.css";

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xff8a00;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId);
    else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onMove(clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height));
  };
  return { ref, onPointerDown: handle, onPointerMove: handle };
}

export interface ColorPickerPopoverProps {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function ColorPickerPopover({ value, onChange, label, className = "", style, children }: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  function commit(next: Hsv) {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexDraft(hex);
    onChange(hex);
  }

  const area = useDrag((x, y) => commit({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((x) => commit({ ...hsv, h: x * 360 }));

  return (
    <span className="color-picker" ref={rootRef}>
      <button type="button" className={className} style={style} aria-label={label} title={label} aria-expanded={open} onClick={() => { if (!open) { setHsv(hexToHsv(value)); setHexDraft(value); } setOpen(!open); }}>{children}</button>
      {open && (
        <div className="color-picker__popover" role="dialog" aria-label={label}>
          <div className="color-picker__area" {...area} style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}>
            <span className="color-picker__thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hsvToHex(hsv) }} />
          </div>
          <div className="color-picker__hue" {...hue}>
            <span className="color-picker__thumb" style={{ left: `${(hsv.h / 360) * 100}%`, top: "50%", backgroundColor: `hsl(${hsv.h} 100% 50%)` }} />
          </div>
          <div className="color-picker__hex-row">
            <span className="color-picker__preview" style={{ backgroundColor: hsvToHex(hsv) }} />
            <input className="color-picker__hex" value={hexDraft} maxLength={7} spellCheck={false} aria-label={label}
              onChange={(event) => { const text = event.target.value; setHexDraft(text); if (/^#[0-9a-f]{6}$/i.test(text)) { setHsv(hexToHsv(text)); onChange(text.toLowerCase()); } }} />
          </div>
        </div>
      )}
    </span>
  );
}
