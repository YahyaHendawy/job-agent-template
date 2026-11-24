import { redirect } from "next/navigation";

/** The Guide now lives in To do (weekly sites, every-few-months checks, what happens after you apply). */
export default function Guide() { redirect("/todo"); }
