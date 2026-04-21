// 定义一个异步函数，处理健康检查请求
export async function healthz(_req, res) {
  // 返回一个 JSON 响应，表示服务状态正常
  return res.status(200).json({ status: 'ok' });
}