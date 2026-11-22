import { workflows } from "../workflow-os/definitions";
import { Runtime } from "../runtime/runtime";
import { handlers } from "../runtime/handlers";
import { Orchestrator } from "./orchestrator";

const [cmd, id] = process.argv.slice(2);
if (cmd === "list") workflows.forEach(w => console.log(`${w.id}\t${w.name}\t${w.steps.length} steps`));
else if (cmd === "run") {
  const wf = workflows.find(w => w.id === id);
  if (!wf) { console.error("Unknown workflow. Run: npm run workflow:list"); process.exit(1); }
  const ctx = { runId: crypto.randomUUID(), actor: { id: "dev-actor", permissions: new Set<string>() }, scopeId: "dev-community", data: {}, audit: [] };
  new Orchestrator(new Runtime(handlers)).run(wf, ctx).then(r => { console.log(r); console.table(ctx.audit); });
} else console.log("Usage: workflow:list | workflow:run -- <workflow-id>");
