import crypto from "crypto";
import axios from "axios";
import { IS_DEBUG } from "../config/constants.js";

// 定义一个异步函数，接受微信登录的 code 参数，并调用微信 API 获取 session 信息
// 返回一个包含 openid、unionid、session_key 和 is_mock 字段的对象
export async function wechatCodeToSession(code) {
  const appId = process.env.WECHAT_APP_ID || "";
  const appSecret = process.env.WECHAT_APP_SECRET || "";
  
  if (IS_DEBUG && code.startsWith("test-")) {
    const fakeOpenid = `mock_${crypto.createHash("md5").update(code, "utf8").digest("hex").slice(0, 24)}`;
    return {
      openid: fakeOpenid,
      unionid: null,
      session_key: null,
      is_mock: true,
    };
  }

  const resp = await axios.get("https://api.weixin.qq.com/sns/jscode2session", {
    params: {
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: "authorization_code",
    },
    timeout: 8000,
  });
  const data = resp.data || {};

  if (data.errcode) {
    throw new Error(data.errmsg || "微信登录失败");
  }

  if (!data.openid) {
    throw new Error("微信未返回 openid");
  }

  return {
    openid: data.openid,
    unionid: data.unionid || null,
    session_key: data.session_key || null,
    is_mock: false,
  };
}