import versionMetadata from '../../../version.json' with { type: 'json' };

export type ServiceName = keyof typeof versionMetadata.services;

export type BuildMetadata = {
  releaseVersion: string;
  releaseTag: string;
  commitSha: string | null;
  shortCommitSha: string | null;
  serviceVersions: Record<ServiceName, string>;
};

export type ReleaseInfo = {
  version: string;
  tagName: string;
  htmlUrl: string;
  publishedAt: string | null;
};

export type UpdateStatus =
  | {
      enabled: false;
      status: 'disabled';
      current: string;
      latest: null;
      checkedAt: null;
      error: null;
    }
  | {
      enabled: true;
      status: 'up-to-date' | 'update-available' | 'unknown';
      current: string;
      latest: ReleaseInfo | null;
      checkedAt: string | null;
      error: string | null;
    };

export const PROJECT_RELEASE_VERSION = versionMetadata.release;
export const PROJECT_RELEASE_TAG = formatReleaseTag(PROJECT_RELEASE_VERSION);
export const SERVICE_VERSIONS: Record<ServiceName, string> = versionMetadata.services;

export function getBuildMetadata(env: NodeJS.ProcessEnv = process.env): BuildMetadata {
  const commitSha =
    env.GITCHALERTS_COMMIT_SHA ??
    env.GITHUB_SHA ??
    env.VERCEL_GIT_COMMIT_SHA ??
    env.COMMIT_SHA ??
    null;

  return {
    releaseVersion: PROJECT_RELEASE_VERSION,
    releaseTag: PROJECT_RELEASE_TAG,
    commitSha,
    shortCommitSha: commitSha ? commitSha.slice(0, 12) : null,
    serviceVersions: SERVICE_VERSIONS,
  };
}

export function formatReleaseTag(version: string) {
  return version.startsWith('v') ? version : `v${version}`;
}

export function compareReleaseVersions(a: string, b: string) {
  const parsedA = parseReleaseVersion(a);
  const parsedB = parseReleaseVersion(b);

  for (let index = 0; index < 3; index += 1) {
    const difference = parsedA[index]! - parsedB[index]!;
    if (difference !== 0) return difference;
  }

  return 0;
}

function parseReleaseVersion(version: string): [number, number, number] {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return [0, 0, 0];

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
