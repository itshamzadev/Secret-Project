export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(input: { statusCode: number; code: string; message: string; details?: unknown }) {
    super(input.message);
    this.name = "AppError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.details = input.details;
  }
}
