import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { workflows } from "@/automation/workflow-os/definitions";

// The Postgres workflow engine (migration 0720) must track exactly the steps defined in workflow-os.
const sql = readFileSync(join(__dirname, "../supabase/migrations/20261122000720_workflow_engine_automations.sql"), "utf8");
const block = (fn: string) => sql.slice(sql.indexOf(`create function private.${fn}`), sql.indexOf("$$;", sql.indexOf(`create function private.${fn}`)));
const arrays = (src: string) => Object.fromEntries([...src.matchAll(/when '([A-E]-[a-z]+)'\s+then array\[([^\]]*)\]/g)]
  .map((m) => [m[1], [...m[2]!.matchAll(/'([a-z-]+)'/g)].map((x) => x[1])]));

describe("workflow definitions ↔ database engine", () => {
  it("step ids and order match for A–E", () => {
    const steps = arrays(block("workflow_steps"));
    expect(Object.keys(steps).sort()).toEqual(workflows.map((w) => w.id).sort());
    for (const w of workflows) expect(steps[w.id], w.id).toEqual(w.steps.map((s) => s.id));
  });
  it("approval gates match", () => {
    const gates = arrays(block("workflow_gates"));
    for (const w of workflows) expect(gates[w.id] ?? [], w.id).toEqual(w.steps.filter((s) => s.approval).map((s) => s.id));
  });
});
