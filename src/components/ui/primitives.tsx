import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */

export function Card({
	children,
	className,
	as: Tag = "div",
}: {
	children: ReactNode;
	className?: string;
	as?: "div" | "section" | "article";
}) {
	return (
		<Tag
			className={cx("border-2 border-edge bg-surface shadow-pixel", className)}
		>
			{children}
		</Tag>
	);
}

export function CardHeader({
	title,
	meta,
	children,
}: {
	title: string;
	meta?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 border-b-2 border-edge px-3 py-2">
			<Label>{title}</Label>
			{children}
			{meta ? <div className="ml-auto text-[16px] text-dim">{meta}</div> : null}
		</div>
	);
}

export function Label({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cx("text-[16px] uppercase tracking-[2px] text-dim", className)}
		>
			{children}
		</span>
	);
}

/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "ghost" | "danger" | "solid";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
	// Hover states swap colour instantly. A fade would read as a modern web
	// app and undo the whole aesthetic.
	primary:
		"border-2 border-accent text-accent hover:bg-accent hover:text-accent-ink",
	solid:
		"border-2 border-accent bg-accent text-accent-ink hover:brightness-110",
	ghost: "border-2 border-edge text-dim hover:border-ink hover:text-ink",
	danger: "border-2 border-sell text-sell hover:bg-sell hover:text-bg",
};

const SIZE: Record<ButtonSize, string> = {
	sm: "px-2 py-[1px] text-[16px]",
	md: "px-3 py-[3px]",
	lg: "px-4 py-[6px] text-[21px]",
};

export function Button({
	variant = "ghost",
	size = "md",
	className,
	children,
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
}) {
	return (
		<button
			type="button"
			{...rest}
			className={cx(
				"uppercase tracking-[1px] disabled:pointer-events-none disabled:opacity-40",
				VARIANT[variant],
				SIZE[size],
				className,
			)}
		>
			{children}
		</button>
	);
}

/* -------------------------------------------------------------------------- */

export type PillTone = "neutral" | "ok" | "progress" | "fail";

const PILL: Record<PillTone, string> = {
	neutral: "border-edge text-dim",
	ok: "border-accent text-accent",
	progress: "border-warn text-warn",
	fail: "border-sell text-sell",
};

export function StatusPill({
	tone = "neutral",
	children,
}: {
	tone?: PillTone;
	children: ReactNode;
}) {
	return (
		<span
			className={cx(
				"whitespace-nowrap border px-2 text-[16px] uppercase tracking-[1px]",
				PILL[tone],
			)}
		>
			{children}
		</span>
	);
}

/* -------------------------------------------------------------------------- */

export function Chip({
	active,
	children,
	onClick,
}: {
	active?: boolean;
	children: ReactNode;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cx(
				"border-2 px-2 py-[1px] text-[17px] uppercase tracking-[1px]",
				active
					? "border-accent bg-accent text-accent-ink"
					: "border-edge text-dim hover:border-ink hover:text-ink",
			)}
		>
			{children}
		</button>
	);
}

export function Led({ on = true }: { on?: boolean }) {
	return (
		<span
			aria-hidden
			className={cx(
				"inline-block size-[8px]",
				on ? "animate-pulse-led bg-accent" : "bg-edge",
			)}
		/>
	);
}

/* -------------------------------------------------------------------------- */

export function Empty({
	title,
	hint,
	action,
}: {
	title: string;
	hint?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
			<p className="text-dim">
				{title}
				<span className="ml-1 inline-block animate-blink text-accent">█</span>
			</p>
			{hint ? (
				<p className="max-w-[42ch] text-[17px] text-dim">{hint}</p>
			) : null}
			{action}
		</div>
	);
}

export function Loading({ label = "Loading" }: { label?: string }) {
	return (
		<p className="px-3 py-4 text-dim">
			{label}
			<span className="ml-1 inline-block animate-blink text-accent">█</span>
		</p>
	);
}
