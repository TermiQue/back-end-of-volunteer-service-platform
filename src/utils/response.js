export function ok(data = null, message = "OK") {
  return { code: 0, message, data };
}

export function fail(code, message) {
  return { code, message };
}

export function unauthorized(res) {
  return res.status(200).json(fail(40101, "Unauthorized"));
}