const configuredBase =
  typeof import.meta.env.BASE_URL === "string"
    ? import.meta.env.BASE_URL.replace(/\/$/, "")
    : "";

export function sitePath(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!configuredBase) {
    return normalized;
  }

  return `${configuredBase}${normalized}`;
}

export function siteBasePath(): string {
  return configuredBase;
}
