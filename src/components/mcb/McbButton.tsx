import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { mcbButtonClass, type McbButtonTone } from "../../lib/buttonClass";

interface LinkProps {
  to: string;
  tone?: McbButtonTone;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}

export const McbButtonLink = ({ to, tone = "primary", className = "", children, onClick }: LinkProps) => (
  <Link to={to} onClick={onClick} className={mcbButtonClass(tone, className)}>
    {children}
  </Link>
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: McbButtonTone;
}

export const McbButton = ({ tone = "primary", className = "", type = "button", ...rest }: ButtonProps) => (
  <button type={type} className={mcbButtonClass(tone, className)} {...rest} />
);
