import ts from "typescript";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
// Compile test dependencies with the installed TypeScript compiler, without a native runner.
function emit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      emit(file);
      continue;
    }
    if (!file.endsWith(".ts") || file.endsWith(".d.ts")) continue;
    const target = path.resolve(".test-build", file.replace(/\.ts$/, ".js"));
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    });
    const output = outputText.replace(
      /require\("@\/([^"\n]+)"\)/g,
      (_, alias) => {
        let relative = path
          .relative(
            path.dirname(target),
            path.resolve(".test-build/src", alias),
          )
          .replaceAll("\\", "/");
        if (!relative.startsWith(".")) relative = "./" + relative;
        return `require(${JSON.stringify(relative)})`;
      },
    );
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, output);
  }
}
emit("src");
emit("tests");
execFileSync(process.execPath, ["--test", ".test-build/tests/domain.test.js"], {
  stdio: "inherit",
});
