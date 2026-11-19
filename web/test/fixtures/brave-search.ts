export type BraveFixtureResult = {
  url: string;
  title?: string | null;
  content?: string | null;
};

export function braveSearchResponse({
  results,
}: {
  query?: unknown;
  results: readonly BraveFixtureResult[];
}): Response {
  return Response.json({
    type: "search",
    web: {
      results: results.map(({ content, ...result }) => ({
        ...result,
        description: content,
      })),
    },
  });
}

export function readBraveQuery(input: unknown): string {
  return (new URL(String(input)).searchParams.get("q") ?? "")
    .split(" ")
    .filter((word) => !word.startsWith("-site:"))
    .join(" ");
}

export function readBraveExcludedSites(input: unknown): string[] {
  return (new URL(String(input)).searchParams.get("q") ?? "")
    .split(" ")
    .filter((word) => word.startsWith("-site:"))
    .map((word) => word.slice(6));
}
