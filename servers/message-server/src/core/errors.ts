export interface ApplicationErrorOptions {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: unknown | undefined;

  public constructor(options: ApplicationErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}
