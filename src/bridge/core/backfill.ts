function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries an operation through hub rate limits. Linear's limits reset on a
// rolling window, so back off and keep waiting rather than dropping work.
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  isRateLimited: (err: unknown) => boolean,
): Promise<T> {
  let delayMs = 60_000;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimited(err)) throw err;
      console.warn("[bridge]", "rate limited, waiting", `${delayMs / 1000}s`);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 15 * 60_000);
    }
  }
}
