// No Node imports here: this module is also pulled into client components
// (MAX_ENTRY_CHARS), so it must stay bundler-safe.
export const MAX_ENTRY_CHARS = 750;
export const WEEKS_PER_YEAR = 52;

export function dataDir(): string {
  return process.env.DATA_DIR ?? `${process.cwd()}/data`;
}
