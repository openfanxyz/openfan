type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

function log(level: LogLevel, context: string, message: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    context,
    data,
    timestamp: new Date().toISOString(),
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  info: (context: string, message: string, data?: Record<string, unknown>) =>
    log('info', context, message, data),
  warn: (context: string, message: string, data?: Record<string, unknown>) =>
    log('warn', context, message, data),
  error: (context: string, message: string, data?: Record<string, unknown>) =>
    log('error', context, message, data),
};
