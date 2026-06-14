import { getPaddleClient, getWebhookSecret, type PaddleEnv } from "@/lib/paddle.server";

export async function verifyWebhookEvent(request: Request, env: PaddleEnv) {
  const signature = request.headers.get("paddle-signature");
  const body = await request.text();
  if (!signature || !body) throw new Error("Missing signature or body");
  const secret = getWebhookSecret(env);
  const paddle = getPaddleClient(env);
  return await paddle.webhooks.unmarshal(body, secret, signature);
}
