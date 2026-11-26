import { PageHeader } from "@/components/ui";
import { CvAddForm } from "@/components/CvAddForm";
import { getSource, getItems, outline, buildDocx } from "@/lib/cvdoc";
import { uploadCvSource, deleteCvItem, toggleCvItem } from "@/app/actions";

export const dynamic = "force-dynamic";

/** My CV: add to it, then download it in your own Word layout. */
export default async function MyCv({ searchParams }: { searchParams: Promise<{ error?: string; added?: string; uploaded?: string }> }) {
  const sp = await searchParams;
  const src = await getSource();
  const items = await getItems();
  const sections = src ? outline(src.data) : [];
  const preview = src ? buildDocx(src.data, items).preview : [];
  const upload = (
    <form action={uploadCvSource} className="space-y-2" encType="multipart/form-data">
      <input type="file" name="cv" accept=".docx" required className="input" />
      <button className="btn btn-ghost !text-sm">{src ? "Replace my CV file" : "Upload my CV"}</button>
    </form>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="My CV" subtitle="Add new experience, projects and skills, then download your CV in the same Word format you gave." />
      {sp.error === "file" && <p className="card p-3 text-sm" style={{ color: "var(--bad)" }}>Choose a Word file (.docx) under 4.4 MB.</p>}
      {sp.error === "read" && <p className="card p-3 text-sm" style={{ color: "var(--bad)" }}>That file couldn&apos;t be read. Save it from Word as .docx and try again.</p>}
      {sp.error === "empty" && <p className="card p-3 text-sm" style={{ color: "var(--bad)" }}>Fill in at least the organisation or role (or the text for a line).</p>}

      {!src ? (
        <section className="card p-4 space-y-2"><h2 className="font-bold">Upload your CV</h2>
          <p className="text-sm text-muted">Your Word CV becomes the template: everything you add is written into it in the same style.</p>{upload}</section>
      ) : (
        <>
          <section className="card p-4 gradient-hero space-y-2" data-jump="Download">
            <h2 className="font-bold">Your CV</h2>
            <p className="text-sm text-muted">{src.filename} · {items.filter((i) => i.include).length} addition{items.filter((i) => i.include).length === 1 ? "" : "s"}</p>
            <a href="/api/cv/docx" className="btn btn-primary w-full !py-3">⬇️ Download my CV (.docx)</a>
            <p className="text-xs text-muted">Same layout, fonts and spacing as your file. To send a PDF, open it in Word or Pages and export as PDF.</p>
          </section>

          <section className="card p-4 space-y-2" id="add">
            <h2 className="font-bold">Add to my CV</h2>
            {sp.added && <p className="text-sm" style={{ color: "var(--good)" }}>✓ Added. It&apos;s in the preview below.</p>}
            <CvAddForm sections={sections} />
          </section>

          {items.length > 0 && (
            <section className="card p-4" id="added">
              <h2 className="font-bold mb-1">What you&apos;ve added</h2>
              <ul className="divide-y divide-line text-sm">
                {items.slice().reverse().map((i) => (
                  <li key={i.id} className="py-2 flex items-start gap-2">
                    <div className="min-w-0 flex-1" style={i.include ? undefined : { opacity: 0.5 }}>
                      <p className="font-semibold">{i.kind === "entry" ? `${i.role ?? ""}${i.org ? ` · ${i.org}` : ""}` : `${i.label ? `${i.label}: ` : ""}${i.text}`}</p>
                      <p className="text-xs text-muted">{i.section}{i.sublist ? ` › ${i.sublist}` : ""}{i.dates ? ` · ${i.dates}` : ""}{i.bullets.length ? ` · ${i.bullets.length} bullet${i.bullets.length > 1 ? "s" : ""}` : ""}{i.include ? "" : " · hidden"}</p>
                    </div>
                    <form action={toggleCvItem.bind(null, i.id)}><button className="btn btn-ghost !py-1 !px-2 !text-xs">{i.include ? "Hide" : "Show"}</button></form>
                    <form action={deleteCvItem.bind(null, i.id)}><button className="btn btn-ghost !py-1 !px-2 !text-xs" aria-label="Remove">✕</button></form>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-4" id="preview">
            <h2 className="font-bold mb-2">Preview</h2>
            <div className="rounded-lg p-4 text-[13px] leading-snug space-y-1" style={{ background: "#fff", color: "#111", fontFamily: "Times New Roman, serif" }}>
              {preview.map((p, i) => p.style === "name" ? <p key={i} className="text-center font-bold text-lg">{p.text}</p>
                : p.style === "heading" ? <p key={i} className="font-bold border-b border-black/60 mt-3">{p.text}</p>
                : p.style === "entry" ? <p key={i} className="font-semibold mt-2">{p.text}</p>
                : p.style === "bullet" ? <p key={i} className="pl-4">• {p.text}</p> : <p key={i}>{p.text}</p>)}
            </div>
          </section>

          <details className="card p-4 text-sm"><summary className="font-semibold cursor-pointer">Replace the CV file</summary>
            <p className="text-xs text-muted my-2">Upload a newer version of your Word CV. Your additions stay and are written into the new file.</p>{upload}</details>
        </>
      )}
    </div>
  );
}
