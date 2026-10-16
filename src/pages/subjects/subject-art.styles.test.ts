import subjectStyles from "./subject-art.css?raw";
import mathStyles from "./math-workbench.css?raw";

it("uses a light calm math direction without aurora or glass effects", () => {
  expect(subjectStyles).toContain(".subject-space--math");
  expect(subjectStyles).toContain(".subject-core--calm");
  expect(subjectStyles).toContain(".subject-bento--calm");
  expect(subjectStyles).not.toContain("subject-scene--aurora");
  expect(subjectStyles).not.toContain("subject-scene__orb");
  expect(subjectStyles).not.toContain("subject-scene__formula");
  expect(subjectStyles).not.toContain("backdrop-filter");
});

it("keeps the math workbench light, touchable, and responsive", () => {
  expect(mathStyles).toMatch(/\.math-action\s*\{[^}]*min-block-size:\s*var\(--touch-target\)/s);
  expect(mathStyles).toMatch(/@media\s*\(max-width:\s*920px\)/);
  expect(mathStyles).toMatch(/@media\s*\(max-width:\s*680px\)/);
  expect(mathStyles).toContain("#e9896f");
  expect(mathStyles).toContain("#bdd4ba");
  expect(mathStyles).toContain("#f0d894");
  expect(mathStyles).toContain("#b9c8de");
  expect(mathStyles).not.toMatch(/radial-gradient|backdrop-filter|text-shadow/);
  expect(mathStyles).not.toMatch(/filter:\s*drop-shadow|text-shadow:\s*0\s+0|backdrop-filter/);
});
