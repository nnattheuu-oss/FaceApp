/*
 * MODULE A — Twelve Palaces: SpiritMaxx's own interpretations.
 *
 * Owner decision L-05 (DR-2026-09-23-LAUNCH-V1): readings are presented as
 * "SpiritMaxx interpretation, inspired by classical Mien Shiang." A line may
 * be presented as a direct classical quotation ONLY if it comes from the four
 * Kanripo WYG texts with its locator. Nothing below is a quotation, and
 * nothing below may be described as traditional.
 *
 * --- WHAT IS AND IS NOT CLAIMED -------------------------------------------------
 * The palace NAMES and placements are the tradition's (twelve-palaces.js keeps
 * them, with their own sources-differ note). Everything else here is written
 * by SpiritMaxx: `lens` says what the name points at, `interpretation` is our
 * reading of it, `question` is the prompt it leaves the reader with.
 *
 * These interpretations are written for the PALACE, not derived from a face.
 * The scan establishes only whether the area was clearly visible. The view
 * says so beside every card (PALACE_BASIS_NOTE) — presenting a fixed text as
 * if the face had produced it is the bespoke-certainty failure the charter
 * forbids, and it would also be a false claim about a paid product.
 *
 * --- CONSTRAINTS EVERY STRING HERE OBEYS ---------------------------------------
 *   - No prediction: nothing about what will happen, no wealth, rank, lifespan,
 *     partner or children outcome (OPTION_B_020_DOSSIER.md §10.2; L-06 item 2).
 *   - No health vocabulary (L-06 item 1; CLAUDE.md item 19). The classical
 *     name for the nose-bridge palace concerns illness; it is presented only
 *     as "Palace of Trials" and read as ordinary strain.
 *   - No belief attribution (L-06 item 3).
 *   - No measurement claim: no depth, height, projection or bone (L-06 item 4,
 *     L-05 Five Mountains rule applied here too).
 *   - No assertion about the reader ("you are", "you have", "your nature").
 *     Questions are allowed; they ask, they do not tell.
 * Enforced by tests/copy-guard.test.js (registered in MODULE_A_COPY) and
 * tests/launch-content-gate.test.js.
 */

/** The L-05 label. One wording, used by every reading surface. */
export const INTERPRETATION_LABEL =
  "SpiritMaxx interpretation, inspired by classical Mien Shiang.";

export const PALACE_BASIS_NOTE =
  "Written for this palace, not read from your face. The scan shows only whether the area was clearly visible.";

export const PALACE_INTERPRETATIONS = Object.freeze({
  life: Object.freeze({
    lens: "The classical name, Life Palace, gives the small space between the brows the job of gathering the whole face together.",
    interpretation: "We read it as a threshold rather than a verdict: the place a frown forms before a decision is spoken aloud. This palace asks where attention is gathering before it turns into words.",
    question: "What have you been deciding quietly, before saying it out loud?",
  }),
  wealth: Object.freeze({
    lens: "Classical manuals give the tip of the nose the name Wealth Palace.",
    interpretation: "SpiritMaxx reads no bank balance from a nose. We take the name as a question about keeping. The tip of the nose is the first part of anyone to arrive in a room, and what a person chooses to hold on to arrives with them too.",
    question: "What are you keeping that no longer needs keeping, and what deserves more care than it gets?",
  }),
  siblings: Object.freeze({
    lens: "The eyebrows carry the classical name Siblings Palace.",
    interpretation: "Two brows move together without ever being quite the same, which is most of what a sibling is. We read the name as the people who grew up alongside you, by birth or by circumstance.",
    question: "Who shares your history closely enough to disagree with you honestly?",
  }),
  property: Object.freeze({
    lens: "The upper eyelids are named the Property Palace in classical manuals.",
    interpretation: "An eyelid is a small roof that opens and closes over everything seen. We read the name as home: the rooms, routines and ordinary objects that let someone close their eyes and feel settled.",
    question: "Which part of where you live is asking to be tended this season?",
  }),
  children: Object.freeze({
    lens: "The area beneath the eyes is traditionally called the Children Palace.",
    interpretation: "This reading says nothing about whether anyone has children. We read the name more widely, as whatever is being raised: a person, a project, a skill still too young to stand on its own.",
    question: "What are you bringing up that needs patience more than pressure?",
  }),
  support: Object.freeze({
    lens: "The lower jaw and chin are traditionally named for the people who offer support.",
    interpretation: "The chin is the part of the face the rest appears to rest on. We read this palace as a question of who holds things up, and whose weight is carried in return.",
    question: "Who could you lean on a little more, and who is quietly leaning on you?",
  }),
  partner: Object.freeze({
    lens: "The outer corners of the eyes are traditionally called the Partner Palace.",
    interpretation: "The outer corners are where a smile reaches last. We read the name as closeness in any form, partner, friend or collaborator, and the ease that shows at the edges of a look rather than at its centre.",
    question: "Who do you relax around without deciding to?",
  }),
  trials: Object.freeze({
    lens: "The bridge of the nose sits in the place classical manuals give to hardship; here it is called the Palace of Trials.",
    interpretation: "The bridge of the nose takes the weight of glasses and the strain of a long squint. We read it as the place pressure settles. It is not a sign of anything to come; it is a prompt to notice what has been carried too long without a rest.",
    question: "What strain have you stopped noticing because it has become ordinary?",
  }),
  travel: Object.freeze({
    lens: "The temples and the sides of the forehead carry the classical name Travel Palace.",
    interpretation: "The temples sit at the edge of the face, where a view turns sideways. We read the name as movement at every scale: a journey, a new route to work, a change of mind.",
    question: "Where would a small change of route show you something new?",
  }),
  career: Object.freeze({
    lens: "The centre of the forehead is traditionally called the Career Palace.",
    interpretation: "The centre of the forehead leads when someone leans into their work. We read this palace as effort and its direction rather than its reward: what the effort is aimed at, and whether that is still the thing it was meant for.",
    question: "If this week's work had a single point, what would it be?",
  }),
  fortune: Object.freeze({
    lens: "The upper sides of the forehead carry the classical name Fortune Palace.",
    interpretation: "The name promises more than any face can show, so we read it plainly, as contentment: the sense of having enough, which sits apart from how much there is.",
    question: "What already feels like enough, if you let it?",
  }),
  parents: Object.freeze({
    lens: "The upper forehead, left and right, is traditionally named for parents.",
    interpretation: "We read it as inheritance of every kind: habits, phrases, ways of standing, including the ones worth keeping and the ones worth setting down.",
    question: "Which inherited habit would you keep on purpose, if you were choosing it now?",
  }),
});

/** Status carried on each palace so no view can mistake this for heritage prose. */
export const APP_AUTHORED = "APP_AUTHORED_INTERPRETATION";
