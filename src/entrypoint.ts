import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Robust replacement for the common
 * `import.meta.url === pathToFileURL(process.argv[1]).href` "is this the entry
 * module" guard.
 *
 * That check breaks whenever the script is invoked through a symlink — which is
 * exactly how npm/pnpm/yarn wire up `package.json#bin` commands (and how `npm link`
 * works). Node resolves `import.meta.url` to the module's real, symlink-resolved
 * path, but leaves `process.argv[1]` as the path that was actually invoked (the
 * symlink itself), so a direct string comparison never matches for a symlinked bin
 * script. The process then silently exits without ever calling `main()`.
 *
 * Comparing realpaths on both sides fixes this for direct invocation, `npm link`,
 * and global installs alike.
 */
export function isMainModule(moduleUrl: string): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(invokedPath);
  } catch {
    return false;
  }
}
