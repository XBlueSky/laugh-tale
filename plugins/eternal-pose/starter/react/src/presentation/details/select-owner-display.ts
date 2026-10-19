export interface OwnerDisplayInput {
  title: string;
  details: readonly string[];
  reservationTitles: readonly string[];
  unresolved: boolean;
  unresolvedLabel: string;
}

export interface OwnerDisplay {
  details: readonly string[];
  showUnresolved: boolean;
}

const normalized = (value: string) => value.trim().replace(/\s+/g, " ");

export function repeatsOwnerTitle(title: string, ownerTitle: string): boolean {
  return normalized(title) === normalized(ownerTitle);
}

export function selectOwnerDisplay(input: OwnerDisplayInput): OwnerDisplay {
  const repeated = new Set([
    input.title,
    ...input.reservationTitles,
    ...(input.unresolved ? [input.unresolvedLabel] : []),
  ].map(normalized));
  return {
    details: input.details.filter(detail => !repeated.has(normalized(detail))),
    showUnresolved: input.unresolved,
  };
}
