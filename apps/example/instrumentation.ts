export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerGlobalErrorHandlers } = await import("@nukesai-pos/backend");
    const { getPos } = await import("@nukesai-pos/backend/bootstrap");
    const pos = await getPos();
    registerGlobalErrorHandlers({ logger: pos.logger, runtime: pos.env.BACKEND_RUNTIME });
  }
}
