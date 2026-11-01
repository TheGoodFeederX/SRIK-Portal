/** Postgres error inspection that also unwraps drizzle's driver-error wrapper. */
const pgCode = (error: unknown): string | undefined =>
  (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;

export const isUniqueViolation = (error: unknown): boolean => pgCode(error) === '23505';

export const constraintName = (error: unknown): string =>
  (error as { constraint_name?: string }).constraint_name ??
  (error as { constraint?: string }).constraint ??
  (error as { cause?: { constraint_name?: string } }).cause?.constraint_name ??
  '';
