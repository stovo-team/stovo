import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { renderAsync } from "docx-preview";

async function formattedDocxFixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
      <Default Extension="xml" ContentType="application/xml" />
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml" />
      <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml" />
    </Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
    </Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml" />
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml" />
    </Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal" /></w:style>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1" /><w:pPr><w:outlineLvl w:val="0" /></w:pPr><w:rPr><w:b /><w:sz w:val="48" /></w:rPr></w:style>
    </w:styles>`);
  zip.file("word/numbering.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet" /><w:lvlText w:val="•" /></w:lvl></w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0" /></w:num>
    </w:numbering>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>PROFESSIONAL SUMMARY</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:b /><w:sz w:val="32" /></w:rPr><w:t>Backend developer</w:t></w:r><w:r><w:t> with experience.</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0" /><w:numId w:val="1" /></w:numPr></w:pPr><w:r><w:t>Production APIs</w:t></w:r></w:p>
      <w:sectPr><w:pgSz w:w="12240" w:h="15840" /></w:sectPr>
    </w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

describe("DOCX renderer fidelity", () => {
  it("keeps heading styles, run formatting, page layout, and bulleted lists", async () => {
    const host = document.createElement("div");
    const bytes = await formattedDocxFixture();

    await renderAsync(bytes, host, host, {
      className: "stovo-test",
      useBase64URL: true,
      renderAltChunks: false,
    });

    expect(host.textContent).toContain("PROFESSIONAL SUMMARY");
    expect(host.textContent).toContain("Backend developer with experience.");
    expect(host.textContent).toContain("Production APIs");
    expect(host.querySelector(".stovo-test-wrapper")).not.toBeNull();
    expect(host.querySelector("section.stovo-test")?.getAttribute("style")).toContain("width: 612pt");
    expect(Array.from(host.querySelectorAll("style"), (style) => style.textContent).join("\n")).toContain("font-size: 24.00pt");
    expect(host.querySelector(".stovo-test-num-1-0")?.textContent).toContain("Production APIs");
  });
});
