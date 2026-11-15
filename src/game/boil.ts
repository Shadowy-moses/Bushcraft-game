/**
 * How creek water becomes safe. The bark pot is the method.
 * Stone boiling is not in this round. A later method replaces BOIL_METHOD.
 */
export interface BoilMethod {
  id: string;
  name: string;
  emptyFrame: string;
  fullFrame: string;
  wornFrame: string;
  coalsFrame: string;
  boilingFrame: string;
  steamFrames: readonly [string, string];
  /** Real seconds the pot sits on the coals. */
  seconds: number;
}

export const BARK_POT: BoilMethod = {
  id: 'bark-pot',
  name: 'bark pot',
  emptyFrame: 'item_bark_cup',
  fullFrame: 'item_bark_cup_water',
  wornFrame: 'item_bark_cup_worn',
  coalsFrame: 'bark_pot_coals',
  boilingFrame: 'bark_pot_coals_boil',
  steamFrames: ['steam_0', 'steam_1'],
  seconds: 4,
};

/** The boil the game uses today. */
export const BOIL_METHOD: BoilMethod = BARK_POT;
