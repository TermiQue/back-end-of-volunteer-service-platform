export class AppError extends Error {
  constructor(code, message, httpStatus = 200, details = null) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function isMysqlDuplicateKeyError(error, keyName) {
  if (!error || error.code !== "ER_DUP_ENTRY") {
    return false;
  }
  if (!keyName) {
    return true;
  }
  return String(error.message || "").includes(String(keyName));
}

export function isMysqlForeignKeyError(error) {
  return Boolean(error && error.code === "ER_ROW_IS_REFERENCED_2");
}