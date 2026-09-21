// Shared lifecycle helpers used by the stack and its browser supervisor.
export async function databaseUrlForRun({ isolated, environment, startLocalPostgres }) {
  if (!isolated && environment.LYKAR_E2E_DATABASE_URL) return environment.LYKAR_E2E_DATABASE_URL;
  return startLocalPostgres();
}

export function waitForExit(child, timeoutMs = 10_000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onExit = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      reject(new Error(`Process ${child.pid ?? 'unknown'} did not stop in ${timeoutMs} ms`));
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

export async function stopChild(child, { processGroup = false } = {}) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const kill = signal => {
    try {
      if (processGroup) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  kill('SIGTERM');
  try {
    await waitForExit(child);
  } catch {
    kill('SIGKILL');
    await waitForExit(child, 5_000);
  }
}
