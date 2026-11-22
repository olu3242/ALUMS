import Link from "next/link";
import { cn } from "@/lib/utils";

const base = "inline-flex items-center justify-center gap-2 rounded-xl font-heading font-semibold transition-[background-color,box-shadow,transform,color] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";
const variants = {
  primary: "bg-primary text-primary-fg shadow-sm hover:brightness-110 hover:shadow-lift",
  secondary: "border border-line bg-surface text-ink hover:border-accent/60 hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  onDark: "border border-white/30 text-white hover:bg-white/10",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
} as const;
const sizes = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-12 px-6 text-base" } as const;

export type ButtonProps = { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string };

export const buttonClass = ({ variant = "primary", size = "md", className }: ButtonProps = {}) =>
  cn(base, variants[variant], sizes[size], className);

export function Button({ variant, size, className, ...props }: ButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={buttonClass({ variant, size, className })} {...props} />;
}

export function ButtonLink({ variant, size, className, href, ...props }: ButtonProps & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <Link href={href} className={buttonClass({ variant, size, className })} {...props} />;
}
