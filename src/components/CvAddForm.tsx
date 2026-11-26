"use client";
import { useState } from "react";
import { addCvItem } from "@/app/actions";

type S = { heading: string; kind: "entry" | "line"; sublists: string[] };

/** Add to a section of your CV; the fields match what that section holds. */
export function CvAddForm({ sections }: { sections: S[] }) {
  const options = sections.flatMap((s) => [{ value: s.heading, kind: s.kind, label: s.heading }, ...s.sublists.map((l) => ({ value: `${s.heading} › ${l}`, kind: "line" as const, label: `${s.heading} › ${l}` }))]);
  const [where, setWhere] = useState(options.find((o) => /work/i.test(o.value))?.value ?? options[0]?.value ?? "");
  const kind = options.find((o) => o.value === where)?.kind ?? "line";
  return (
    <form action={addCvItem} className="space-y-2 text-sm">
      <input type="hidden" name="kind" value={kind} />
      <label className="block"><span className="text-xs text-muted font-semibold">Section</span>
        <select name="where" value={where} onChange={(e) => setWhere(e.target.value)} className="input mt-0.5">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      {kind === "entry" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="org" placeholder="Organisation (e.g. Siemens)" className="input" />
          <input name="location" placeholder="Location (e.g. London, UK)" className="input" />
          <input name="role" placeholder="Role (e.g. Electronics Intern)" className="input" />
          <input name="dates" placeholder="Dates (e.g. Jun 2027 – Sep 2027)" className="input" />
          <textarea name="bullets" rows={4} placeholder={"Bullet points, one per line. Start with an action and add a number if you can:\nTested 40 PCBs and found a soldering fault that halved rework."} className="input sm:col-span-2" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input name="label" placeholder={/project/i.test(where) ? "Project name" : "Label (optional, e.g. Certifications)"} className="input" />
          <input name="text" required placeholder={/project/i.test(where) ? "What you built and the result" : "Text (e.g. MATLAB Onramp, 2027)"} className="input sm:col-span-2" />
        </div>
      )}
      <button className="btn btn-primary w-full">Add to my CV</button>
      <p className="text-xs text-muted">Only add things you really did. It's written into your CV in the same style, and matching and tailored CVs use it straight away.</p>
    </form>
  );
}
