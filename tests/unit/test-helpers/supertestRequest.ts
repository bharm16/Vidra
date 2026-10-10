export async function runSupertestRequest<T>(
  execute: () => Promise<T>,
): Promise<T> {
  return await execute();
}
