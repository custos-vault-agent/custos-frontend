import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx, Label } from "./primitives";

const CONTROL =
	"w-full border-2 border-edge bg-surface2 px-2 py-[3px] focus:border-accent focus:outline-none";

export function Field({
	label,
	hint,
	error,
	children,
}: {
	label?: string;
	hint?: ReactNode;
	error?: string;
	children: ReactNode;
}) {
	return (
		// The control is passed in as children, so the association is real even
		// though it cannot be seen statically from here.
		// biome-ignore lint/a11y/noLabelWithoutControl: control arrives via children
		<label className="block">
			{label ? (
				<span className="mb-1 flex items-baseline gap-2">
					<Label>{label}</Label>
					{hint ? (
						<span className="ml-auto text-[16px] text-dim">{hint}</span>
					) : null}
				</span>
			) : null}
			{children}
			{error ? (
				<span className="mt-1 block text-[16px] text-sell">{error}</span>
			) : null}
		</label>
	);
}

export function TextInput({
	className,
	invalid,
	...rest
}: ComponentPropsWithRef<"input"> & { invalid?: boolean }) {
	return (
		<input
			{...rest}
			className={cx(CONTROL, invalid && "border-sell", className)}
		/>
	);
}

export function TextArea({
	className,
	...rest
}: ComponentPropsWithRef<"textarea">) {
	return (
		<textarea {...rest} className={cx(CONTROL, "resize-none", className)} />
	);
}

export function Select({
	className,
	children,
	...rest
}: ComponentPropsWithRef<"select">) {
	return (
		<select {...rest} className={cx(CONTROL, "appearance-none", className)}>
			{children}
		</select>
	);
}

/**
 * A select that sits inside another control instead of being one. It shares no
 * classes with CONTROL on purpose: overriding `w-full` from the outside is a
 * race the caller cannot see, and losing it silently collapses whatever the
 * select is standing next to.
 */
export function InlineSelect({
	className,
	children,
	...rest
}: ComponentPropsWithRef<"select">) {
	return (
		<select
			{...rest}
			className={cx(
				"shrink-0 appearance-none border-0 bg-transparent px-1 py-0 focus:outline-none",
				className,
			)}
		>
			{children}
		</select>
	);
}

/**
 * A select that reads as a chip. `appearance-none` strips the native arrow, so
 * the caret is drawn back on top with pointer-events disabled — the select
 * still covers the whole chip, and the caret cannot become a dead zone.
 */
export function SelectChip({
	bare,
	className,
	children,
	...rest
}: ComponentPropsWithRef<"select"> & { bare?: boolean }) {
	return (
		<span
			className={cx(
				"relative inline-flex items-center",
				!bare && "border-2 border-edge bg-surface2",
			)}
		>
			<InlineSelect {...rest} className={cx("pr-5", className)}>
				{children}
			</InlineSelect>
			<span
				aria-hidden
				className="pointer-events-none absolute right-1 text-[15px] text-dim"
			>
				▾
			</span>
		</span>
	);
}

/** A locked, visibly non-editable row. Used for the owner wallet on the
 *  register form, where "you cannot change this" is the point being made. */
export function LockedValue({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-center gap-2 border-2 border-dashed border-edge bg-surface2 px-2 py-[3px] text-dim">
			<span aria-hidden>⊂</span>
			<span className="truncate">{children}</span>
			<span className="ml-auto shrink-0 text-[16px] uppercase tracking-[1px]">
				locked
			</span>
		</div>
	);
}

/* -------------------------------------------------------------------------- */

export type TabItem<T extends string> = {
	id: T;
	label: string;
	/** A short marker rendered next to the label, e.g. "soon". */
	hint?: string;
};

/** Tabs snap. No slide, no fade — pixel interfaces do not animate position. */
export function Tabs<T extends string>({
	items,
	value,
	onChange,
}: {
	items: TabItem<T>[];
	value: T;
	onChange: (id: T) => void;
}) {
	return (
		<div className="flex border-b-2 border-edge" role="tablist">
			{items.map((item) => {
				const active = item.id === value;
				return (
					<button
						key={item.id}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(item.id)}
						className={cx(
							"flex items-baseline gap-1 px-3 py-[2px] uppercase tracking-[1px]",
							active ? "bg-accent text-accent-ink" : "text-dim hover:text-ink",
						)}
					>
						{item.label}
						{item.hint ? (
							<span
								className={cx(
									"text-[15px] tracking-[1px]",
									active ? "text-accent-ink/70" : "text-dim",
								)}
							>
								{item.hint}
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
