import { cx } from "#/components/ui/primitives";
import { useStore } from "#/lib/store";

export function Toaster() {
	const { toasts, dismissToast } = useStore();
	return (
		<output
			aria-live="polite"
			className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
		>
			{toasts.map((t) => (
				<button
					key={t.id}
					type="button"
					onClick={() => dismissToast(t.id)}
					className={cx(
						"pointer-events-auto animate-enter border-2 bg-surface2 px-3 py-2 text-left",
						t.tone === "ok" && "border-accent text-accent",
						t.tone === "fail" && "border-sell text-sell",
						t.tone === "pending" && "border-edge text-dim",
					)}
				>
					<div className="break-words text-[16px] uppercase tracking-[1px]">
						{t.title}
						{t.tone === "pending" && (
							<span className="ml-1 inline-block animate-blink text-accent">
								█
							</span>
						)}
					</div>
					{t.detail && (
						<div className="break-words text-[16px] text-dim">{t.detail}</div>
					)}
				</button>
			))}
		</output>
	);
}
