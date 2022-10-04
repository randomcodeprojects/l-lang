import path from "path";
import build from ".";
import fs from "fs";

const [, , ...files] = process.argv;

for (const file of files) {
	const ext = path.extname(file);
	const code = fs.readFileSync(file, "utf-8");
	const compiled = build(code);
	const newFilename = file.replace(ext, ".ts");
	fs.writeFileSync(newFilename, compiled, "utf-8");
}
