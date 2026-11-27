export class DomainError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Sesi Admin dibutuhkan atau PIN tidak valid.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Data tidak ditemukan.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class RateLimitError extends DomainError {
  constructor(message = "Terlalu banyak percobaan PIN salah. Tunggu beberapa menit.") {
    super(message, 429, "RATE_LIMITED");
  }
}
