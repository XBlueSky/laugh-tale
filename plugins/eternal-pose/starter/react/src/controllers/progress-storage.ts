const STORAGE_PREFIX = "eternal-pose:trip-progress:v1:";

export function tripProgressStorageKey(tripId: string): string {
  return `${STORAGE_PREFIX}${tripId}`;
}
