export type PageViewContext = {
  pagePath: string;
  screen: string;
  referrerHost?: string;
  viewport?: "mobile" | "tablet" | "desktop";
  language?: string;
  campaign?: {
    source?: string;
    medium?: string;
    name?: string;
    term?: string;
    content?: string;
  };
};

function headerValue(headers: Headers, name: string, maxLength: number): string | undefined {
  const value = headers.get(name)?.trim().slice(0, maxLength);
  return value || undefined;
}

export function classifyVisitor(headers: Headers) {
  const agent = headers.get("user-agent") || "";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Firefox\//.test(agent)
      ? "Firefox"
      : /OPR\//.test(agent)
        ? "Opera"
        : /Chrome\//.test(agent) && !/Chromium\//.test(agent)
          ? "Chrome"
          : /Safari\//.test(agent) && !/Chrome\//.test(agent)
            ? "Safari"
            : "Other";
  const os = /Android/.test(agent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(agent)
      ? "iOS"
      : /Windows/.test(agent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "Other";
  const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(agent)
    ? "tablet"
    : /Mobile|iPhone|Android/i.test(agent)
      ? "mobile"
      : "desktop";

  return {
    browser,
    os,
    device,
    country: headerValue(headers, "cf-ipcountry", 2)?.toUpperCase(),
    region: headerValue(headers, "cf-region", 80),
    city: headerValue(headers, "cf-ipcity", 80),
  };
}

export function pageViewMetadata(
  headers: Headers,
  context: PageViewContext,
): Record<string, unknown> {
  return {
    ...context,
    ...classifyVisitor(headers),
  };
}
