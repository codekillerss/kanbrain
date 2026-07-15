export function buildReadCommand(relativeContextFilePath: string): string {
  const normalized = relativeContextFilePath.split('\\').join('/');
  return `Read the file ${normalized} and follow the instructions in it.`;
}
