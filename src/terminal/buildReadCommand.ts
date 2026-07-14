export function buildReadCommand(relativeContextFilePath: string): string {
  const normalized = relativeContextFilePath.split('\\').join('/');
  return `Leia o arquivo ${normalized} e siga as instruções nele.`;
}
