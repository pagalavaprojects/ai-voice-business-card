export class ApplicationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR",
    public errors: string[] = []
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string = "Validation failed", errors: string[] = []) {
    super(message, 400, "VALIDATION_ERROR", errors);
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(message: string = "Permission denied") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class InfrastructureError extends ApplicationError {
  constructor(message: string = "Infrastructure service error") {
    super(message, 502, "INFRASTRUCTURE_ERROR");
  }
}
