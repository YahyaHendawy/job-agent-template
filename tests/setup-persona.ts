/** Tests run against a fictional sample owner (tests/fixtures/persona.sample.json), never a real person's data. */
import { readFileSync } from "node:fs";
import { setPersona } from "../src/lib/persona";
setPersona(JSON.parse(readFileSync(new URL("./fixtures/persona.sample.json", import.meta.url), "utf8")));
