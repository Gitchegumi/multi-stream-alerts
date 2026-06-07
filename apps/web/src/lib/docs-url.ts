export const DEFAULT_DOCS_URL =
  'https://github.com/Gitchegumi/multi-stream-alerts/blob/main/docs/index.md';

export function getDocsUrl(envUrl = process.env.NEXT_PUBLIC_DOCS_URL) {
  const configuredUrl = envUrl?.trim();
  return configuredUrl && configuredUrl.length > 0 ? configuredUrl : DEFAULT_DOCS_URL;
}
