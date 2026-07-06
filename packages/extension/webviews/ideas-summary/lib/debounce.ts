export interface Debounced<T extends (...args: never[]) => void> {
    schedule: (...args: Parameters<T>) => void;
    cancel: () => void;
}

export function createDebounced<T extends (...args: never[]) => void>(
    fn: T,
    delayMs: number
): Debounced<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    return {
        schedule: (...args: Parameters<T>) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delayMs);
        },
        cancel: () => {
            clearTimeout(timer);
            timer = undefined;
        }
    };
}
