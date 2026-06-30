import {
  compareReleaseVersions,
  formatReleaseTag,
  getBuildMetadata,
  type ReleaseInfo,
  type UpdateStatus,
} from '@multi-stream-alerts/shared';

const DEFAULT_UPDATE_CHECK_REPO = 'Gitchegumi/multi-stream-alerts';
const UPDATE_CHECK_TTL_MS = 60 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  status: UpdateStatus;
};

let cachedStatus: CacheEntry | null = null;

export async function getVersionStatus(
  env: NodeJS.ProcessEnv = process.env,
  options: { force?: boolean } = {},
) {
  const build = getBuildMetadata(env);
  const updateStatus = await getUpdateStatus(build.releaseVersion, env, Date.now(), options);

  return {
    build,
    update: updateStatus,
  };
}

export async function getUpdateStatus(
  currentVersion: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
  options: { force?: boolean } = {},
): Promise<UpdateStatus> {
  const enabled = env.UPDATE_CHECK_ENABLED !== 'false';

  if (!enabled) {
    return {
      enabled: false,
      status: 'disabled',
      current: formatReleaseTag(currentVersion),
      latest: null,
      checkedAt: null,
      error: null,
    };
  }

  if (!options.force && cachedStatus && cachedStatus.expiresAt > now) {
    return cachedStatus.status;
  }

  const repo = env.UPDATE_CHECK_REPO ?? DEFAULT_UPDATE_CHECK_REPO;
  const checkedAt = new Date(now).toISOString();

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'gitchalerts-update-check',
      },
      cache: options.force ? 'no-store' : undefined,
      next: options.force ? undefined : { revalidate: UPDATE_CHECK_TTL_MS / 1000 },
    });

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      published_at?: string | null;
    };

    if (!payload.tag_name || !payload.html_url) {
      throw new Error('GitHub release response was missing release metadata');
    }

    const latest: ReleaseInfo = {
      version: payload.tag_name.replace(/^v/, ''),
      tagName: payload.tag_name,
      htmlUrl: payload.html_url,
      publishedAt: payload.published_at ?? null,
    };

    const status: UpdateStatus = {
      enabled: true,
      status:
        compareReleaseVersions(latest.tagName, currentVersion) > 0
          ? 'update-available'
          : 'up-to-date',
      current: formatReleaseTag(currentVersion),
      latest,
      checkedAt,
      error: null,
    };

    cachedStatus = {
      expiresAt: now + UPDATE_CHECK_TTL_MS,
      status,
    };

    return status;
  } catch (error) {
    const status: UpdateStatus = {
      enabled: true,
      status: 'unknown',
      current: formatReleaseTag(currentVersion),
      latest: null,
      checkedAt,
      error: error instanceof Error ? error.message : 'Update check failed',
    };

    cachedStatus = {
      expiresAt: now + UPDATE_CHECK_TTL_MS,
      status,
    };

    return status;
  }
}
