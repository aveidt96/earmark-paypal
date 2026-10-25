export class AgentError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AgentError";
  }
}
export async function bounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  ms: number,
  code: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AgentError(code));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
