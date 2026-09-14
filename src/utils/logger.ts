export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

export const logger = {
  info(message: string, ...args: any[]) {
    console.log(
      `${colors.dim}[${timestamp()}]${colors.reset} ${colors.blue}[INFO]${colors.reset} ${message}`,
      ...args
    );
  },
  success(message: string, ...args: any[]) {
    console.log(
      `${colors.dim}[${timestamp()}]${colors.reset} ${colors.green}[SUCCESS]${colors.reset} ${message}`,
      ...args
    );
  },
  warn(message: string, ...args: any[]) {
    console.warn(
      `${colors.dim}[${timestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${message}`,
      ...args
    );
  },
  error(message: string, ...args: any[]) {
    console.error(
      `${colors.dim}[${timestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${message}`,
      ...args
    );
  },
  debug(message: string, ...args: any[]) {
    if (process.env.DEBUG === "true") {
      console.log(
        `${colors.dim}[${timestamp()}]${colors.reset} ${colors.magenta}[DEBUG]${colors.reset} ${message}`,
        ...args
      );
    }
  },
  crawler(message: string, ...args: any[]) {
    console.log(
      `${colors.dim}[${timestamp()}]${colors.reset} ${colors.cyan}[CRAWLER]${colors.reset} ${message}`,
      ...args
    );
  },
  discord(message: string, ...args: any[]) {
    console.log(
      `${colors.dim}[${timestamp()}]${colors.reset} ${colors.magenta}[DISCORD]${colors.reset} ${message}`,
      ...args
    );
  },
};

