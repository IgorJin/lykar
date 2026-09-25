import { useRef, useState } from 'preact/hooks';

import { ApiError } from './api';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAsyncAction(
  refresh: () => Promise<void>,
  enabled: boolean,
  conflictMessage: string,
) {
  const [pendingAction, setPendingAction] = useState('');
  const [actionError, setActionError] = useState('');
  const inFlight = useRef(false);

  async function runAction(
    key: string,
    mutate: () => Promise<void>,
    options: { refresh?: boolean } = {},
  ): Promise<boolean> {
    if (inFlight.current || !enabled) return false;
    inFlight.current = true;
    setPendingAction(key);
    setActionError('');
    try {
      try {
        await mutate();
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 409) {
          setActionError(`${conflictMessage} (${reason.message})`);
          try {
            await refresh();
          } catch (refreshError) {
            setActionError(current => `${current} Не удалось обновить данные: ${errorMessage(refreshError)}`);
          }
        } else {
          setActionError(errorMessage(reason));
        }
        return false;
      }

      if (options.refresh !== false) {
        try {
          await refresh();
        } catch (reason) {
          setActionError(`Действие выполнено, но данные не обновились: ${errorMessage(reason)}. Нажмите «Повторить» для загрузки.`);
        }
      }
      return true;
    } finally {
      inFlight.current = false;
      setPendingAction('');
    }
  }

  return { pendingAction, actionError, setActionError, runAction };
}
