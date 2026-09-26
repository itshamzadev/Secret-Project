export interface ApplicationErrorOptions {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

/**
 * Transport-neutral application error shared by the API and extracted
 * services. It carries no framework or persistence dependencies.
 */
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
