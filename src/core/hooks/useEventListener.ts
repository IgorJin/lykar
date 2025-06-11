import { useEffect, useRef } from 'preact/hooks';

type EventTargetLike = Window | Document | HTMLElement | null;

/**
 * React hook, which adds an event listener to the element.
 * @param {keyof WindowEventMap | keyof HTMLElementEventMap} eventName - name of the event
 * @param {(event: Event) => void} handler - event handler
 * @param {EventTargetLike | React.RefObject<EventTargetLike>} [element] - target element, defaults to window
 * @returns {void}
 */
export function useEventListener<K extends keyof WindowEventMap | keyof HTMLElementEventMap>(
  eventName: K,
  handler: (event: any) => void,
  element?: EventTargetLike | React.RefObject<EventTargetLike>
) {
  // Всегда актуальный handler через ref
  const savedHandler = useRef(handler);

  // Обновлять ref при изменении handler
  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    // Получаем реальный элемент
    let target: EventTargetLike;
    if (!element) {
      target = window;
    } else if ('current' in element) {
      target = element.current;
    } else {
      target = element;
    }
    if (!target?.addEventListener) return;

    const eventListener = (event: Event) => savedHandler.current(event);

    target.addEventListener(eventName, eventListener);
    return () => target?.removeEventListener(eventName, eventListener);
  }, [eventName, element]);
}
