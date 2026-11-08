export type ReleaseCheckResult =
  | { state: "current" | "ahead"; latestVersion: string }
  | { state: "available"; latestVersion: string; releaseUrl: string }
  | { state: "unpublished" };
