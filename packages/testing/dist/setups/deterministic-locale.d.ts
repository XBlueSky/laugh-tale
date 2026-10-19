export interface DeterministicLocaleSetup {
    locale: string;
    timeZone: string;
    instant: string;
}
export declare function createDeterministicLocaleSetup(input?: Partial<DeterministicLocaleSetup>): DeterministicLocaleSetup;
