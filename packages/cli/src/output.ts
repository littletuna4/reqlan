export function emit(value: unknown, asJson: boolean): void {
    if (asJson) {
        console.log(JSON.stringify(value, null, 2));
        return;
    }
    if (typeof value === 'string') {
        console.log(value);
        return;
    }
    console.log(String(value));
}
