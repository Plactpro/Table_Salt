/**
 * Shared PIN validation utility — runs identically on server and client.
 * Rejects weak PINs including sequential, reverse-sequential, and all-same-digit patterns.
 */

export function isWeakPin(pin: string, userIdLastFour?: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;

  const digits = pin.split("").map(Number);

  // All same digits (0000, 1111, ... 9999)
  if (digits.every((d) => d === digits[0])) return true;

  // Forward sequential (1234, 2345, 3456, ... 9012, 0123)
  const isForwardSeq =
    digits[1] === (digits[0] + 1) % 10 &&
    digits[2] === (digits[1] + 1) % 10 &&
    digits[3] === (digits[2] + 1) % 10;
  if (isForwardSeq) return true;

  // Reverse sequential (9876, 8765, 7654, ... 1098)
  const isReverseSeq =
    digits[1] === (digits[0] - 1 + 10) % 10 &&
    digits[2] === (digits[1] - 1 + 10) % 10 &&
    digits[3] === (digits[2] - 1 + 10) % 10;
  if (isReverseSeq) return true;

  // Matches staff's own ID last 4 digits
  if (userIdLastFour && pin === userIdLastFour) return true;

  return false;
}

export function pinValidationError(pin: string, userIdLastFour?: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "PIN must be exactly 4 digits";

  const digits = pin.split("").map(Number);

  if (digits.every((d) => d === digits[0]))
    return "PIN cannot be all the same digit (e.g. 1111)";

  const isForwardSeq =
    digits[1] === (digits[0] + 1) % 10 &&
    digits[2] === (digits[1] + 1) % 10 &&
    digits[3] === (digits[2] + 1) % 10;
  if (isForwardSeq) return "PIN cannot be a sequential number (e.g. 1234)";

  const isReverseSeq =
    digits[1] === (digits[0] - 1 + 10) % 10 &&
    digits[2] === (digits[1] - 1 + 10) % 10 &&
    digits[3] === (digits[2] - 1 + 10) % 10;
  if (isReverseSeq) return "PIN cannot be a reverse sequential number (e.g. 9876)";

  if (userIdLastFour && pin === userIdLastFour)
    return "PIN cannot match the last 4 digits of your staff ID";

  return null;
}
