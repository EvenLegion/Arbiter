import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SHELL_DIRECTORIES = ['src/listeners', 'src/scheduled-tasks'];

function listTypeScriptFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			return listTypeScriptFiles(fullPath);
		}
		return fullPath.endsWith('.ts') ? [fullPath] : [];
	});
}

describe('runtime shell boundaries', () => {
	it('does not use container access directly in listeners or scheduled tasks', () => {
		const sourceFiles = SHELL_DIRECTORIES.flatMap((relativeDir) => listTypeScriptFiles(path.resolve(process.cwd(), relativeDir)));

		for (const sourceFile of sourceFiles) {
			const source = fs.readFileSync(sourceFile, 'utf8');

			expect(source, sourceFile).not.toMatch(/\bthis\.container\b/);
			expect(source, sourceFile).not.toMatch(/\bcontainer\./);
		}
	});
});
