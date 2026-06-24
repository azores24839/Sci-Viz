export function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function canMarkPlanExecutable(openBlockers: number): boolean {
  return openBlockers === 0;
}
