/**
 * Structured logger wrapper around console.
 *
 * - In development: human-readable multi-line output.
 * - In production: single-line JSON ready to be scraped by a log collector.
 *
 * Acts as a seam for future integration with Sentry / Datadog / Axiom:
 * swap the implementation here without touching call sites.
 *
 * Usage:
 *   logger.info('queries.projets', 'fetched projets list', { count: 42 });
 *   logger.error('queries.factures', err, { ref: 'FAC-DUP-0012' });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

interface LogRecord {
  level: LogLevel;
  scope: string;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    cause?: unknown;
    code?: string;
  };
}

const isProduction = process.env.NODE_ENV === 'production';

function serializeError(err: unknown): LogRecord['error'] {
  if (err instanceof Error) {
    const code =
      'code' in err && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : undefined;
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
      code,
    };
  }
  return { name: 'Unknown', message: String(err) };
}

function forwardToSentry(record: LogRecord): void {
  if (record.level !== 'error' && record.level !== 'warn') return;
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  // Dynamic import evite de tirer Sentry dans le bundle si non configure.
  void import('@sentry/nextjs').then((Sentry) => {
    const tags: Record<string, string> = { scope: record.scope };
    if (record.error?.code) tags.code = record.error.code;
    if (record.error) {
      const err = new Error(record.error.message);
      err.name = record.error.name;
      if (record.error.stack) err.stack = record.error.stack;
      Sentry.captureException(err, {
        level: record.level === 'warn' ? 'warning' : 'error',
        tags,
        extra: record.context,
      });
    } else {
      Sentry.captureMessage(record.message, {
        level: record.level === 'warn' ? 'warning' : 'error',
        tags,
        extra: record.context,
      });
    }
  });
}

function emit(record: LogRecord): void {
  const { level } = record;
  forwardToSentry(record);
  if (isProduction) {
    // Single-line JSON for log collectors
    const line = JSON.stringify(record);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
    return;
  }

  // Dev-friendly multiline
  const prefix = `[${record.level.toUpperCase()}] ${record.scope}`;
  const payload = {
    ...(record.context ? { context: record.context } : {}),
    ...(record.error ? { error: record.error } : {}),
  };
  const args =
    Object.keys(payload).length > 0
      ? [prefix, record.message, payload]
      : [prefix, record.message];
  if (level === 'error') {
    console.error(...args);
  } else if (level === 'warn') {
    console.warn(...args);
  } else if (level === 'debug') {
    console.debug(...args);
  } else {
    console.log(...args);
  }
}

function log(
  level: LogLevel,
  scope: string,
  messageOrError: string | unknown,
  context?: LogContext,
): void {
  const timestamp = new Date().toISOString();
  if (typeof messageOrError === 'string') {
    emit({ level, scope, message: messageOrError, timestamp, context });
    return;
  }
  // messageOrError is an Error (or unknown)
  const err = serializeError(messageOrError);
  emit({
    level,
    scope,
    message: err?.message ?? 'unknown error',
    timestamp,
    error: err,
    context,
  });
}

export const logger = {
  debug: (scope: string, message: string, context?: LogContext) =>
    log('debug', scope, message, context),
  info: (scope: string, message: string, context?: LogContext) =>
    log('info', scope, message, context),
  warn: (scope: string, message: string, context?: LogContext) =>
    log('warn', scope, message, context),
  /**
   * Log an error. Second arg accepts either a string message or a caught error.
   */
  error: (
    scope: string,
    messageOrError: string | unknown,
    context?: LogContext,
  ) => log('error', scope, messageOrError, context),
};
