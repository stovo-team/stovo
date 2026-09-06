import type { MouseEventHandler, Ref } from "react";
import { Link, type To } from "react-router-dom";

import { IconBack } from "./icons";

type BackButtonProps = {
  ariaLabel: string;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
  to?: To;
  buttonRef?: Ref<HTMLButtonElement>;
};

/** A compact, consistently styled control for returning to the previous view. */
export function BackButton({ ariaLabel, buttonRef, className, onClick, title, to }: BackButtonProps) {
  const classes = ["back-button", className].filter(Boolean).join(" ");

  if (to !== undefined) {
    return <Link to={to} className={classes} aria-label={ariaLabel} title={title}><IconBack size={18} /></Link>;
  }

  return <button ref={buttonRef} type="button" className={classes} aria-label={ariaLabel} title={title} onClick={onClick}><IconBack size={18} /></button>;
}
