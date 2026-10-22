import { readCssSource } from "../test/cssSource";
import { expect, it } from "vitest";
it("bounds prejoin previews by viewport height on small desktops",()=>{
 const styles=readCssSource("src/styles.css");
 const rules=[...styles.matchAll(/\.guest-prejoin-preview\s*\{([^}]+)\}/g)];
 expect(rules.at(-1)?.[1]).toContain("max-height: min(320px, 40dvh);");
 expect(rules.at(-1)?.[1]).toContain("width: min(100%, calc(40dvh * 16 / 9));");
 const group=[...styles.matchAll(/\.group-call-prejoin-preview\s*\{([^}]+)\}/g)];
 expect(group.at(-1)?.[1]).toContain("max-height: min(220px, 36dvh);");
 const card=[...styles.matchAll(/\.group-call-prejoin-card\s*\{([^}]+)\}/g)];
 expect(card.at(-1)?.[1]).toContain("max-height: calc(100dvh - 32px);");
});
