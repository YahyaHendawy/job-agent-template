/** Plain GET search form (works without JavaScript; the query lands in the URL so results are shareable/back-button friendly). */
export function SearchBox({ action, placeholder, defaultValue, hidden = {}, autoFocus }: {
  action: string; placeholder: string; defaultValue?: string; hidden?: Record<string, string | undefined>; autoFocus?: boolean;
}) {
  return (
    <form action={action} method="get" role="search" className="flex gap-2 mb-3">
      {Object.entries(hidden).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="relative flex-1">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input name="q" type="search" defaultValue={defaultValue ?? ""} placeholder={placeholder} autoFocus={autoFocus}
          className="input !pl-9 !py-2" enterKeyHint="search" autoComplete="off" />
      </div>
      <button className="btn btn-primary !py-2">Search</button>
    </form>
  );
}
