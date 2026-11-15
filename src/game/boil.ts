/**
 * How creek water becomes safe. The bark cup is the method for now.
 * Swap BOIL_METHOD when the real vessel is chosen. Callers should not
 * mention bark, steam frames, or the four-second wait except through this object.
 */
export interface BoilMethod {
  id: string;
  name: string;
  emptyFrame: string;
  fullFrame: string;
  steamFrames: readonly [string, string];
  /** Real seconds the cup must sit at a lit fire. */
  seconds: number;
}

export const BARK_CUP: BoilMethod = {
  id: 'bark-cup',
  name: 'bark cup',
  emptyFrame: 'item_bark_cup',
  fullFrame: 'item_bark_cup_water',
  steamFrames: ['steam_0', 'steam_1'],
  seconds: 4,
};

/** The boil the game uses today. */
export const BOIL_METHOD: BoilMethod = BARK_CUP;
