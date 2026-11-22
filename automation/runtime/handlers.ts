import { Handler } from "./runtime";
// In-memory DEV handlers for `npm run workflow:run` without a database. Labelled sample data only.
// Production uses createSupabaseHandlers() (./supabase-handlers.ts). Missing handlers are intentionally absent so the
// runtime reports BLOCKED rather than success.
export const handlers: Record<string, Handler> = {
  "community.find": async (ctx) => {
    ctx.data.community = { name: "Accounting — Class of 2007", institution: "pending confirmation", sample: "DEV SAMPLE DATA" };
  },
};
