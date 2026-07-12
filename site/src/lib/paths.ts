const configuredBase =
  typeof process.env.NEXT_PUBLIC_BASE_PATH === "string"
    ? process.env.NEXT_PUBLIC_BASE_PATH.replace(/\/$/, "")
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
