export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const unauthorized = (message = 'Não autorizado') =>
  new HttpError(401, message);

export const notFound = (message = 'Recurso não encontrado') =>
  new HttpError(404, message);

export const conflict = (message = 'Conflito') => new HttpError(409, message);
