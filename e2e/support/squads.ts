/**
 * Test squad and the lineups the scheduler deterministically builds for it.
 * If the scheduling algorithm changes on purpose, update the lineups here
 * (tests/scheduler.test.ts guards the algorithm itself).
 */

/** 7v7 puts 6 outfield players on the pitch; this squad leaves 2 on the bench. */
export const SQUAD = [
	"Alva",
	"Bo",
	"Cleo",
	"Dino",
	"Ebba",
	"Filip",
	"Greta",
	"Hugo",
] as const;

/** The fewest players a 7v7 match can start with. */
export const MINIMUM_SQUAD = SQUAD.slice(0, 6);

/** Pitch lists read top to bottom: attack, midfield, defence. */
export const KICKOFF = {
	pitch: ["Cleo", "Bo", "Ebba", "Filip", "Alva", "Dino"],
	bench: ["Greta", "Hugo"],
};

export const SECOND_SWAP = {
	comingIn: ["Greta", "Hugo"],
	goingOut: ["Ebba", "Filip"],
	pitch: ["Hugo", "Alva", "Cleo", "Dino", "Bo", "Greta"],
	bench: ["Ebba", "Filip"],
};
