import { createJudgeHandler } from "../../../server/paypal/judge-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createJudgeHandler();
export const GET = handle;
export const POST = handle;
