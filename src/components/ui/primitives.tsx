import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-w-0 rounded-xl border border-line bg-surface shadow-card", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[14px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};
export const buttonClasses = ({
  variant = "secondary",
  size = "md",
  className,
}: Pick<ButtonProps, "variant" | "size" | "className">) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-[14px]",
    variant === "primary" && "bg-brand text-white hover:bg-brand-strong shadow-card",
    variant === "secondary" &&
      "border border-line-strong bg-surface text-ink hover:bg-surface-2 shadow-card",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
    variant === "danger" && "border border-line-strong bg-surface text-critical hover:bg-critical-soft",
    className,
  );

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-brand",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-ink-2", className)} {...props} />;
}

const TONES = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  brand: "bg-brand-soft text-brand-strong border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  serious: "bg-serious-soft text-serious border-transparent",
  critical: "bg-critical-soft text-critical border-transparent",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Th({
  className,
  align,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-[1] border-b border-line bg-surface-2 px-3 py-2.5 text-[12px] font-medium tracking-wide whitespace-nowrap text-ink-3 uppercase",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}
export function Td({
  className,
  align,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) {
  return (
    <td
      className={cn(
        "border-b border-line px-3 py-2.5 text-[13.5px] text-ink",
        align === "right" && "tnum text-right",
        className,
      )}
      {...props}
    />
  );
}

/** Table header cell that links to a sorted version of the list. */
export function SortTh({
  href,
  active,
  dir,
  align,
  children,
}: {
  href: string;
  active: boolean;
  dir: "asc" | "desc";
  align?: "right";
  children: React.ReactNode;
}) {
  return (
    <Th align={align} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={href} className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}>
        {children}
        {active && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </Link>
    </Th>
  );
}
