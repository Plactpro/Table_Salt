export interface ItemTiming {
  itemId: string;
  itemName: string;
  prepMinutes: number;
  suggestedStartAt: Date;
  estimatedReadyAt: Date;
  startInMinutes: number;
  isOverdue: boolean;
  cookingStatus: string;
}

/**
 * Calculate suggested start times for a set of items that are all in the same
 * firing window (e.g. all course-1 items, or all items in a fired course).
 * Course 2+ item timing should never be computed here — callers must filter
 * before passing. Only course-1 or explicit single-course sets should be passed.
 *
 * The engine back-calculates from a shared target ready time so all items
 * finish at approximately the same moment: start = targetReady - prepMinutes.
 */
export function calculateSuggestedStartTimes(
  items: Array<{ id: string; name: string; prepMinutes: number; courseNumber: number }>,
  targetReadyTime?: Date
): ItemTiming[] {
  if (items.length === 0) return [];

  const now = new Date();
  const maxPrepTime = Math.max(...items.map(i => i.prepMinutes), 0);
  const targetReady = targetReadyTime ?? new Date(now.getTime() + maxPrepTime * 60 * 1000);

  return items.map(item => {
    const suggestedStart = new Date(targetReady.getTime() - item.prepMinutes * 60 * 1000);
    const startInMinutes = Math.round((suggestedStart.getTime() - now.getTime()) / 60000);
    const isOverdue = startInMinutes <= 0;

    let cookingStatus: string;
    if (isOverdue) {
      cookingStatus = "start_now";
    } else if (startInMinutes <= 5) {
      cookingStatus = "start_soon";
    } else {
      cookingStatus = "on_track";
    }

    return {
      itemId: item.id,
      itemName: item.name,
      prepMinutes: item.prepMinutes,
      suggestedStartAt: suggestedStart,
      estimatedReadyAt: targetReady,
      startInMinutes,
      isOverdue,
      cookingStatus,
    };
  });
}
