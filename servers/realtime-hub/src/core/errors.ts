export class RealtimeError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  public constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = "RealtimeError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string };
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}
