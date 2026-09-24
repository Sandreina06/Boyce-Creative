/** Keep only the shared date/compare params when building links between pages. */
export function dateQuery(params: Record<string, string | string[] | undefined>, extra: Record<string, string> = {}): string {
  const sp = new URLSearchParams();
  for (const k of ["range", "compare", "from", "to"]) {
    const v = params[k];
    if (typeof v === "string") sp.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}
