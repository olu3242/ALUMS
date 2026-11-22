import { Handler } from "./runtime";
// Stage 6: add Supabase-backed, server-side handlers here.
// Missing handlers are intentionally absent so the runtime reports BLOCKED rather than success.
export const handlers: Record<string, Handler> = {
  "community.find": async (ctx) => { ctx.data.community = { name: "Accounting — Class of 2007", institution: "pending confirmation" }; },
};
