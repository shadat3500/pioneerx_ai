export interface ModelCallResult {
  json: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
}
