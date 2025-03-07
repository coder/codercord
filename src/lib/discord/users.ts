export function getClientIDFromToken(token: string): string {
  return atob(token.split(".")[0]);
}
