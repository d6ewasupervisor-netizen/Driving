/**
 * Cutscene stills — the zombie scene images shown behind dialogue in still/video scenes.
 * Keys are scene ids. Files live in /public/stills (60 available, set1..set5 × 12).
 * Pick by mood: set1_04/set2_04 are the DOL lot at night; set1_01/set1_02 are the window.
 */
export const STILL_FOR_SCENE: Record<string, string> = {
  '0.1':  '/stills/set1_zombie_03.webp',   // the road out; both cats; a girl on foot
  '0.3':  '/stills/set2_zombie_07.webp',
  '1.4':  '/stills/set1_zombie_04.webp',   // LICENSING at night — what she left
  '1.4b': '/stills/set3_zombie_02.webp',
  '2.1':  '/stills/set4_zombie_06.webp',
  '2.2':  '/stills/set2_zombie_10.webp',
};
