import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { setCommunityFeature } from "@/lib/actions/admin";
import { FEATURES, type FeatureState } from "@/lib/features";

/** Per-class module switches. Locked modules can only be changed by platform admins. */
export function FeatureSwitches({ communityId, state, isPlatform }: { communityId: string; state: FeatureState; isPlatform: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {FEATURES.map((f) => {
        const s = state[f.key];
        const frozen = s.locked && !isPlatform;
        return (
          <li key={f.key} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{f.label}</p>
              <p className="text-xs text-muted">{f.href}</p>
            </div>
            {s.enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
            {s.locked && <Badge tone="warning">Locked by platform</Badge>}
            {!frozen && (
              <ActionForm action={setCommunityFeature}>
                <input type="hidden" name="community_id" value={communityId} />
                <input type="hidden" name="feature" value={f.key} />
                <input type="hidden" name="enabled" value={String(!s.enabled)} />
                <SubmitButton size="sm" variant={s.enabled ? "secondary" : "primary"} aria-label={`${s.enabled ? "Turn off" : "Turn on"} ${f.label}`}>
                  {s.enabled ? "Turn off" : "Turn on"}</SubmitButton>
              </ActionForm>
            )}
            {isPlatform && (
              <ActionForm action={setCommunityFeature}>
                <input type="hidden" name="community_id" value={communityId} />
                <input type="hidden" name="feature" value={f.key} />
                <input type="hidden" name="enabled" value={String(s.enabled)} />
                <input type="hidden" name="locked" value={String(!s.locked)} />
                <SubmitButton size="sm" variant="ghost" aria-label={`${s.locked ? "Unlock" : "Lock"} ${f.label}`}>{s.locked ? "Unlock" : "Lock"}</SubmitButton>
              </ActionForm>
            )}
          </li>
        );
      })}
    </ul>
  );
}
