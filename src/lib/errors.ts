export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message = 'Requisição inválida') =>
  new HttpError(400, message);

export const unauthorized = (message = 'Não autorizado') =>
  new HttpError(401, message);

export const forbidden = (message = 'Acesso negado') =>
  new HttpError(403, message);

export const notFound = (message = 'Recurso não encontrado') =>
  new HttpError(404, message);

export const conflict = (message = 'Conflito') => new HttpError(409, message);
