"use client";

import { useActionState } from "react";
import {
  addAccountMapping,
  saveBudget,
  saveClientSettings,
  saveTarget,
  type ActionState,
} from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";

type Opt = { id: string; label: string };

function Status({ s }: { s: ActionState }) {
  if (s.error) return <p className="text-sm text-critical">{s.error}</p>;
  if (s.ok) return <p className="text-sm text-good">{s.ok}</p>;
  return null;
}

export function SettingsForm(props: {
  clientId: string;
  disabled: boolean;
  settings: {
    businessType: string;
    primaryConversionField: string;
    primaryConversionLabel: string;
    primaryValueField: string | null;
    primaryKpi: string;
    secondaryKpis: string[];
    attributionWindow: string;
    currency: string;
    timezone: string;
    industry: string | null;
    website: string | null;
    leadMethod: string | null;
    serviceArea: string | null;
    contextNotes: string | null;
  };
  industries: Opt[];
  conversionFields: Opt[];
  valueFields: Opt[];
  kpis: Opt[];
  attributionWindows: Opt[];
}) {
  const [state, action, pending] = useActionState(saveClientSettings, {});
  const s = props.settings;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="clientId" value={props.clientId} />
      <Field label="Business type">
        <NativeSelect name="businessType" defaultValue={s.businessType} disabled={props.disabled}>
          <option value="lead_gen">Lead generation</option>
          <option value="ecommerce">Ecommerce</option>
          <option value="appointment">Appointments</option>
          <option value="custom">Custom</option>
        </NativeSelect>
      </Field>
      <Field label="Primary KPI">
        <NativeSelect name="primaryKpi" defaultValue={s.primaryKpi} disabled={props.disabled}>
          {props.kpis.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Primary conversion (Windsor field)">
        <NativeSelect name="primaryConversionField" defaultValue={s.primaryConversionField} disabled={props.disabled}>
          {props.conversionFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} — {f.id}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Result label (shown in the UI)">
        <Input name="primaryConversionLabel" defaultValue={s.primaryConversionLabel} disabled={props.disabled} />
      </Field>
      <Field label="Revenue / conversion value field">
        <NativeSelect name="primaryValueField" defaultValue={s.primaryValueField ?? ""} disabled={props.disabled}>
          <option value="">None (hide revenue & ROAS)</option>
          {props.valueFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} — {f.id}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Attribution window">
        <NativeSelect name="attributionWindow" defaultValue={s.attributionWindow} disabled={props.disabled}>
          {props.attributionWindows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Currency">
        <Input name="currency" defaultValue={s.currency} maxLength={3} disabled={props.disabled} />
      </Field>
      <Field label="Timezone (IANA)">
        <Input name="timezone" defaultValue={s.timezone} disabled={props.disabled} />
      </Field>
      <div className="border-t border-border pt-4 text-sm font-semibold sm:col-span-2">Business context (used by recommendations)</div>
      <Field label="Industry (sets benchmarks)">
        <NativeSelect name="industry" defaultValue={s.industry ?? ""} disabled={props.disabled}>
          <option value="">Not set</option>
          {props.industries.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="How leads are captured">
        <NativeSelect name="leadMethod" defaultValue={s.leadMethod ?? ""} disabled={props.disabled}>
          <option value="">Not set</option>
          <option value="instant_form">Meta instant forms</option>
          <option value="website">Website (pixel)</option>
          <option value="mixed">Both</option>
          <option value="traffic">Traffic only (no lead tracking)</option>
          <option value="other">Other</option>
        </NativeSelect>
      </Field>
      <Field label="Website">
        <Input name="website" defaultValue={s.website ?? ""} placeholder="https://" disabled={props.disabled} />
      </Field>
      <Field label="Service area">
        <Input name="serviceArea" defaultValue={s.serviceArea ?? ""} disabled={props.disabled} />
      </Field>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Context notes (offer, seasonality, what a good lead is, sales process)</Label>
        <textarea
          name="contextNotes"
          defaultValue={s.contextNotes ?? ""}
          rows={4}
          disabled={props.disabled}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="text-xs font-medium text-muted-foreground">Secondary KPIs</legend>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {props.kpis.map((k) => (
            <label key={k.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="secondaryKpis"
                value={k.id}
                defaultChecked={s.secondaryKpis.includes(k.id)}
                disabled={props.disabled}
              />
              {k.id}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending || props.disabled}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        <Status s={state} />
      </div>
    </form>
  );
}

export function BudgetForm({ clientId, defaultMonth, disabled }: { clientId: string; defaultMonth: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(saveBudget, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Month">
        <Input type="month" name="month" defaultValue={defaultMonth} className="w-40" disabled={disabled} />
      </Field>
      <Field label="Budget">
        <Input type="number" name="amount" min={0} step="0.01" className="w-36" disabled={disabled} required />
      </Field>
      <Field label="Notes">
        <Input name="notes" className="w-56" disabled={disabled} />
      </Field>
      <Button type="submit" disabled={pending || disabled}>
        Save budget
      </Button>
      <Status s={state} />
    </form>
  );
}

export function TargetForm({ clientId, kpis, disabled }: { clientId: string; kpis: Opt[]; disabled: boolean }) {
  const [state, action, pending] = useActionState(saveTarget, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Metric">
        <NativeSelect name="metric" disabled={disabled}>
          {kpis.map((k) => (
            <option key={k.id} value={k.id}>
              {k.id}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Target (CTR/CVR in %)">
        <Input type="number" name="targetValue" min={0} step="0.01" className="w-36" disabled={disabled} required />
      </Field>
      <Button type="submit" disabled={pending || disabled}>
        Save target
      </Button>
      <Status s={state} />
    </form>
  );
}

export function MappingForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(addAccountMapping, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Meta ad account id">
        <Input name="metaAccountId" placeholder="1048672036926458" className="w-52" required />
      </Field>
      <Field label="Display name">
        <Input name="displayName" className="w-56" required />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        Map account
      </Button>
      <Status s={state} />
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
