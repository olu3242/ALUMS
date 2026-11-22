export type Step = {
  id: string;
  handler: string;                 // key into runtime handlers
  permission?: string;             // e.g. "membership.approve"
  approval?: { role: string };     // human gate
  retries?: number;
};
export type Workflow = { id: string; name: string; scope: "platform" | "institution" | "community"; steps: Step[] };
