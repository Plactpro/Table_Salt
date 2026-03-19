let _count = 0;

export function incrementApiRequestCount(): void {
  _count++;
}

export function getApiRequestCount(): number {
  return _count;
}
