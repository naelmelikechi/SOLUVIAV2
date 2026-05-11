/**
 * Buffer circulaire des dernieres erreurs JS, alimente par des listeners
 * `error` + `unhandledrejection` montes une seule fois au premier import
 * cote client. Lu par le formulaire de bug report pour joindre le contexte
 * console au rapport.
 */

const MAX_BUFFER = 10;

interface CapturedError {
  ts: number;
  type: 'error' | 'unhandledrejection';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}

let installed = false;
const buffer: CapturedError[] = [];

function push(err: CapturedError) {
  buffer.push(err);
  if (buffer.length > MAX_BUFFER) buffer.shift();
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    push({
      ts: Date.now(),
      type: 'error',
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    push({
      ts: Date.now(),
      type: 'unhandledrejection',
      message:
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : (JSON.stringify(reason)?.slice(0, 500) ?? 'unknown'),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

export function ensureConsoleErrorBuffer() {
  install();
}

export function getConsoleErrors(): CapturedError[] {
  return buffer.slice();
}
