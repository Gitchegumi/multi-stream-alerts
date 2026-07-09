/**
 * Tailwind class strings shared by the auth-style forms (sign-in,
 * registration, invite management) so field/toggle styling stays
 * consistent without a global stylesheet entry.
 */
export const authFieldClass = 'grid gap-1.5 text-sm';

export const authInputClass =
  'rounded-md border border-line bg-panel-soft px-3 py-2.5 text-text focus:border-accent focus:shadow-[0_0_0_3px_rgba(175,224,206,0.12)] focus:outline-0 aria-invalid:border-danger aria-invalid:outline-danger';

export const authToggleClass =
  'grid grid-cols-2 gap-1 rounded-lg border border-line bg-panel-soft p-1';

export const authToggleButtonClass = (active: boolean) =>
  `min-w-0 cursor-pointer rounded-md border px-2.5 py-[9px] font-bold ${
    active
      ? 'border-[rgba(65,102,245,0.58)] bg-primary-soft text-soft-white'
      : 'border-transparent bg-transparent text-muted'
  }`;
