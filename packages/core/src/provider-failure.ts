export type ProviderFailureReason =
  | "missing-configuration"
  | "loader-failed"
  | "request-denied"
  | "not-found"
  | "malformed-response"
  | "implausible-result"
  | "network"
  | "cancelled"
  | "unsupported";

export interface ProviderUnavailableResult {
  status: "unavailable";
  reason: ProviderFailureReason;
  retryable: boolean;
  diagnostic?: string;
}
