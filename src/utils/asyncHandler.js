// 定义一个异步处理函数，接受一个异步函数作为参数
export function asyncHandler(fn) {
  // 返回一个新的函数，接受请求、响应和下一个中间件函数作为参数
  return function wrapped(req, res, next) {
    // 使用 Promise.resolve 来处理异步函数的返回值，并捕获任何错误
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}