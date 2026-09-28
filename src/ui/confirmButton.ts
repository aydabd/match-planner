import { LIMITS } from "../core/limits.js";

export interface ConfirmOptions {
	/** Label shown while the button waits for the second tap. */
	confirmLabel: string;
	/** Runs on the second tap. */
	onConfirm: () => void;
}

/**
 * A button that needs two taps for a destructive action: the first tap asks
 * for confirmation, the second (within LIMITS.resetConfirmSeconds) runs it.
 * Browser confirm() dialogs are avoided; they are easy to dismiss by mistake
 * on a phone and are blocked in some installed-app modes.
 */
export function confirmWithSecondTap(
	button: HTMLButtonElement,
	options: ConfirmOptions,
): void {
	const label = button.textContent ?? "";
	let timer: ReturnType<typeof setTimeout> | null = null;

	function disarm(): void {
		if (timer !== null) clearTimeout(timer);
		timer = null;
		button.textContent = label;
		button.classList.remove("confirming");
	}

	button.addEventListener("click", () => {
		if (timer === null) {
			button.textContent = options.confirmLabel;
			button.classList.add("confirming");
			timer = setTimeout(disarm, LIMITS.resetConfirmSeconds * 1000);
			return;
		}
		disarm();
		options.onConfirm();
	});
}
