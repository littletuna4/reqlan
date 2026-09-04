/**
 * Share one in-flight promise so overlapping callers do not start a second job.
 * rq:["../../../../reqlan rq/extension/language-support/initialisation-and-sequencing.rq".index_file_search_coalesce]
 */
export type InFlightSlot<T> = {
    current?: Promise<T>;
};

export function shareInFlight<T>(slot: InFlightSlot<T>, start: () => Promise<T>): Promise<T> {
    if (slot.current !== undefined) {
        return slot.current;
    }
    const work = start().finally(() => {
        if (slot.current === work) {
            slot.current = undefined;
        }
    });
    slot.current = work;
    return work;
}
