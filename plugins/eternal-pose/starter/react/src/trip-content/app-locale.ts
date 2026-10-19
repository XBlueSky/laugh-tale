import input from "./trip-input.json";

const authored: { trip: { locale: string } | null; setupLocale?: string } = input;
export const setupLocale = authored.trip === null ? authored.setupLocale! : authored.trip.locale;
