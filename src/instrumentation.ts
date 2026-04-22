/**
 * Next.js server instrumentation entry.
 * Node-only setup is loaded from instrumentation.node.ts so Edge never pulls in native DB deps.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const { runNodeInstrumentation } = await import('./instrumentation.node');
  await runNodeInstrumentation();
}
