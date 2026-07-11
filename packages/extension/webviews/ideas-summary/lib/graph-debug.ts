/** Debug logging for the Ideas Summary graph. Filter DevTools on `[reqlan:graph]`. */
export function graphLog(message: string, data?: unknown): void {
    if (data !== undefined) {
        console.log(`[reqlan:graph] ${message}`, data);
    } else {
        console.log(`[reqlan:graph] ${message}`);
    }
}

export function graphWarn(message: string, data?: unknown): void {
    if (data !== undefined) {
        console.warn(`[reqlan:graph] ${message}`, data);
    } else {
        console.warn(`[reqlan:graph] ${message}`);
    }
}
