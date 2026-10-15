# AI Scribe class games

Three live games for the student-led session on the AI Scribe case
(HBS 9-126-061), run in one flow from the projector, about 21 minutes in all:

1. **Game 1, Spot the error (5 min + 3 min answers and group reports).** Groups A, B and C each
   get a short AI note with three hidden mistakes and circle them on their
   phones in 3 minutes, talking inside the group.
2. **Game 2, The 8-second test (1 min + answers).** One note appears on the
   projector for 8 seconds. Would you sign it? Did you see the problem?
3. **Game 3, The Clinic (about 11 min).** Students run a pixel-art dental
   clinic in groups of three, one phone each: a dentist and two nurses. The
   dentist finishes each patient's chart against a 90-second countdown while
   the nurses read out what the dentist needs. Three teams play the same
   patients in three ways, and the projector ranks the teams by points.

After Game 3, a **Class scores** screen adds up all three games for each
student (see "Running score" below). Around 61:00 (after the StyleMod case slide), **GAME 4 ▶** on that screen
opens Part 3 of the class, **Game 4, Build StyleMod's AI** (30 min, see below).

**The projector is the stage; phones are answer pads.** Notes, timers, results
and every answer are shown on the projector. Whenever the lecturer is talking
(intros, every answer step, the Game 2 note), phones switch to a quiet "Look
up" screen with one personal line, such as "You caught this one". Each step
on the projector has a **For the lecturer** line at the bottom (press **N**
to hide or show it) with what to say or
ask the room next.

All patients, transcripts and notes are made up. No real AI or audio is used:
the "AI draft" is pre-written, with planted mistakes copied from the case.

## Demo-day checklist

**The day before**
1. `git pull && npm run demo:deploy`.
2. On the class laptop open `ai.tecxmate.com/#board`, join from your phone with
   the QR code, click NEXT through to Class scores, then ⚙ → Start again.
3. Print the backup: the three Game 1 notes (A, B, C) and the Game 2 note.

**10 minutes before class**
1. Class laptop: plugged in, sleep and screen saver off, browser zoom 100%.
   Open `ai.tecxmate.com/#board`, then full screen. Use only this screen for
   the class: the first screen to open the room runs it.
2. ⚙ Settings: check the times and the Game 3 patients.
3. Scan the QR with your phone, check your name appears, then ⚙ → Remove it.

**If something goes wrong**
| Problem | Do this |
| --- | --- |
| A phone looks stuck | Reload the page. It comes back where it was. |
| You pressed NEXT too early | ◀ goes back; answers are kept. Replaying a whole game asks first. |
| Someone joined twice, or a rude name | ⚙ → Remove. |
| The projector page was closed | Reopen it in the **same browser**: same room, nothing lost. In another browser it cannot press buttons: open a new `#board` and have everyone scan the new code. |
| A Game 3 clinic has one nurse | Fine: that nurse's phone can switch between both readings. |
| Wi-Fi is down | Printed notes for Game 1, the slide for Game 2, skip Game 3. |

## Setup (once, about 5 minutes)

The games are their own small website on Cloudflare, with no database.

```bash
npm install
npx wrangler login        # opens a browser, log in to your Cloudflare account
npm run demo:deploy       # builds and publishes
```

It publishes to `https://ai.tecxmate.com` (set in `demo/wrangler.jsonc`;
`https://ai-scribe-clinic.niko-tecx.workers.dev` keeps working as a backup).
That is all. There is
no database to create, and it stays within the Cloudflare free plan.

| Who | Open |
| --- | --- |
| Projector | `ai.tecxmate.com/#board`. It makes a new 4-digit room code and shows it with a QR code |
| Students | scan the QR code, or open `ai.tecxmate.com` and type the code; then a nickname |
| Rehearsal | open `#board` in another tab: every new board is a new room, so tests never mix with the class |

The projector takes charge of its room as soon as it opens; another laptop
or a student opening the same room can watch but not press, and only the
projector can clear results. A new code that happens to be in use already is
replaced by a fresh one. Reloading the projector keeps
its room (the code stays in the address). A phone that reloads comes back
where it was.

**How the data flows.** Every phone and the projector talk to one Cloudflare
Worker. Each class "room" is one Durable Object, a single small store that
receives every signed chart in order. A dentist's phone sends one small
message when a chart is signed, and one each time the visit moves on (talking,
charting, signed). The nurses' phones ask every 2 seconds what their dentist
is doing, dentists' phones check in every 5 seconds, the projector asks
for the results and the lineup every 2 seconds, and phones ask what the projector is showing once a second only while
they answer against a clock (Game 1, Game 2), every 2 to 3 seconds on other
screens, every 5 seconds in Game 3 and every 10 seconds on the final scores. Who is online is kept in
memory, so polls cost no storage reads. With 40 phones for a
25-minute class that is roughly 40,000 requests, inside the free plan's
100,000 a day. A rehearsal with a few phones the same day is fine; two full
classes on the same day may need the $5 Workers plan for that month. A test with 25 phones signing at the same
moment stored all 25.

**Without internet:** run `npm run demo` on a laptop. It serves the same site
on the laptop's Wi-Fi address (`http://<laptop-ip>:8787`), so phones on the
same network can join. If the board cannot be reached at all, each phone still
shows its own score ("Show this screen to the presenter").

**Settings (gear ⚙ on the projector, also during Game 3).** Change on the
day, with no code: Game 1 time, Game 2 note and vote seconds, Game 3 chart
seconds, Game 4 build and fix minutes, which Game 3 patients are open (one patient highlights it on every
dentist's phone), each patient's name (type a new first and last name; it
changes everywhere: dialogue, notes, records, cards; keep him or her the same), whether new players may join, remove a player (a test
phone or a duplicate; their phone goes back to Join), and Start again (all
players and answers deleted; settings kept). "Clear results" at the bottom of
the Game 3 board clears Game 3 charts only.

## Games 1 and 2

The projector drives everything: **NEXT** (top right) moves to the next step,
**◀** goes back, and the progress line at the top jumps straight to any game.
A presentation clicker works too: → / Space / Enter / PageDown = Next,
← / PageUp = Back. NEXT is ignored while the Game 2 note is showing.

Going back into Game 1 or Game 2 plays it again from the start: everyone gets
fresh questions and that game's earlier answers (and its guess or poll votes)
are cleared. If anyone has answered already, the projector asks first ("Play
Game 2 again? This clears the answers 18 players have given."), so a stray
◀ never wipes a round. Stepping back and forth between answer steps keeps
every answer.

Leaving Game 3 (◀ Games 1-2 or Class scores ▶) asks first, because any chart
a dentist has not signed yet is lost. "+30 seconds" in Game 1 also works
after the clock hit 0 and reopens the phones that were handed in by the
clock. A phone that joins Game 2 after the vote closed sees "Voting has
closed" and is not counted.

| Step | Projector | Phones |
| --- | --- | --- |
| Join | QR code, room code, nicknames in Groups A, B, C | Nickname; group optional (no pick = the smallest group); can switch group until Game 1 starts |
| Game 1 | 3-minute clock (change in ⚙ Settings), "X of Y done", done count per group, hint buttons, +30 seconds | Their group's note, tap lines to circle, Submit; hints appear when sent; at 0 whatever is circled is handed in |
| Answers 1, step 1: guess | "Which mistake do you think the class missed most?" and how many have guessed | The three choices |
| Answers 1, step 2: stats | "The class found X% of all mistakes", one bar per type (least found first) with the guesses next to it | "You found 2 of 3" |
| Answers 1, step 3–5: mistake cards | One card per mistake type, one at a time, with how many found it | "You caught this one" or "You missed this one" |
| Answers 1, step 6: quote | Dr. Lidia Moura and what happened in the real case | Look up |
| Answers 1, step 7: top 5 | Top 5 nicknames (score, then who submitted first) | Their score |
| Game 2 intro | "Phones down. Eyes on this screen." | Look up |
| 8 seconds | The note, large, on a dark screen, with an 8-second countdown | **Look up and a countdown only: the note is never on the phones** |
| Vote | "Vote on your phone" and how many have voted | "Would you sign this note?" (10 s; no answer counts as Sign), then "Did you see a problem? Tap the line" (10 s) |
| Answers 2, step 1: tally | Two bars: Signed, Spotted the problem (only Allergy or Medicine count) | Look up |
| Answers 2, step 2: note | The note again, Allergy and Medicine in red and joined by an arrow | Their own answers |
| Answers 2, step 3: stats | "X% signed. Only Y% saw the problem." and automation bias | Their own answers |
| Answers 2, step 4: poll | Live tally of "Who should catch errors like this?" | The four choices |
| Game 3 | The Clinic board (with "◀ Games 1-2" to go back and "Class scores ▶" to finish) | The Clinic; the dentist's name is filled in from the nickname, nurses play under theirs |
| Class scores | Top 10 with Game 1, 2 and 3 points, and team averages | Their total, rank and breakdown |

**Groups for Game 1.** Ask people to sit with their letter: everyone in a group
has the same note and may talk it over, while each person circles on their
own phone. The lobby shows who is in each group so you can balance them.

**Scoring for Game 1:** 100 per mistake circled, minus 100 per correct line
circled, never below 0. A perfect round is 3 found and no false alarms.

**Hints.** After 45 seconds, if fewer than 20% of players have circled
anything, the lecturer line suggests sending a hint. Hints go out one at a
time: two medicine names, a follow-up with no history, who said the test was
normal.

**Note text.** The three Game 1 notes, the Game 2 note, the mistake cards,
hints, quote and poll are copied exactly from the session spec into
`src/demo/flow/content.ts`. Every note says it is a made-up training example.

**Nothing to print.** Every note, record and conversation is on the phones,
and the room code and QR are on the projector. The only paper worth bringing
is a backup in case the Wi-Fi fails: a few copies of the three Game 1 notes
(A, B, C) and the Game 2 note on a slide.

## Running score (all three games)

Every student has one score that carries through the class. Each game is
worth about 300:

| Game | Points |
| --- | --- |
| 1, Spot the error | 100 per mistake found, minus 100 per correct line circled (0 to 300) |
| 2, The 8-second test | 100 for not signing, 200 for tapping Allergy or Medicine (0 to 300) |
| 3, The Clinic | the clinic's average chart score ÷ 4, the same for the dentist and both nurses (about 0 to 300) |

Phones show "Your score so far" and the class rank after the Game 1 and
Game 2 answers. After Game 3, press **Class scores ▶** on the board: the
projector shows the top 10 with each game's points and the team totals; each
phone shows its total, rank and breakdown. Team totals are the average of the
members' totals and are just for fun: Games 1 and 2 were played before the
teams existed, and the Game 3 board is still where the teams' ways of working
are compared.

Nurses play under their class nickname, so the dentist's phone shows
"✓ NURSE 1 · BEN" and the board lineup shows "Dr. Mai + Ben, Chi".

## Game 3: The Clinic

### How a round plays

1. **Title:** pick the team and a job. The dentist types their name (the
   dialogue then says "Dr. Anna"). Press START.
2. **Patients (dentist):** pick the patient the presenter gives you. The
   nurses' phones switch to that patient by themselves.
3. **Visit:** a short pixel scene with dialogue and sound. Tap to continue.
   Not timed. ◀ PATIENTS (top bar) goes back to the list until the chart clock
   starts.
4. **Scribby drafts** (Teams 2 and 3): the robot fills in the chart.
5. **Chart, 90 seconds:** 8 cards. Tap an answer, then NEXT. On AI teams,
   Scribby's pick starts selected. The clock ticks in the last 10 seconds and
   signs the chart automatically at 0.
6. **Result:** points, a grade from S to D, the patient's hearts and reaction,
   badges, and the live team ranking.

**Jobs, one phone each (at least 3 people per team):**

| Job | Phone shows | Does |
| --- | --- | --- |
| Dentist | the game: visit, chart cards, sign | Picks the answers and signs. Only this phone scores |
| Nurse 1 | the conversation, word for word (Team 1: the dentist's quick notes instead) | Reads out what the dentist asks for |
| Nurse 2 | the patient's medical history: allergies, medicines, past visits | Reads out what the dentist asks for |

The nurses' phones follow their dentist: same patient, same countdown, and the
score when the chart is signed. A nurse can tap another patient to look ahead.

**Any class size, no setup.** There is nothing to configure before class:
every dentist who joins opens a clinic, and nurses join a dentist.

| Students | Split |
| --- | --- |
| 9 | 3 teams × 1 clinic |
| 18 | 3 teams × 2 clinics (6 dentists, 12 nurses) |
| 19–20 | as 18; extra people join any clinic as a third nurse |
| 16–17 | as 18; one or two clinics have a single nurse |

- When a team has two dentists, each nurse taps the dentist they are helping.
  The two dentists need different names; a dentist's phone warns if the name
  is taken on that team.
- A clinic with only one nurse still works: that nurse's phone gets a switch
  between the conversation (or notes) and the medical history. The switch
  disappears when the second nurse joins.
- The dentist's patient list shows which nurses are with them.
- The board ranks teams by average points per chart, so team size does not
  change the ranking.

**Lineup on the board.** Under each team name the projector shows one chip per
clinic, for example "Dr. Anna + Ben, Chi" (green) or "Dr. Fay · needs Nurse 2"
(yellow), plus "2 nurses picking" for nurses who have not tapped a dentist.
Next to the QR code it counts the phones that have joined, so you can check
it says 18 before you start. A phone counts as joined while it is open; one
closed for 30 seconds drops off.

### The three teams

| Team | Mode | What they do |
| --- | --- | --- |
| 1 | Manual | No AI. Pick every answer from the dentist's notes, written from memory |
| 2 | AI Scribe | Scribby drafts every card. Keep or change each pick, then sign |
| 3 | AI + Safety check | Same, plus a check that compares the chart with the patient record |

### Scoring (the same rules for every team)

| | Points |
| --- | --- |
| Each correct card you checked (pressed NEXT on) | +100 |
| Each correct safety card (tooth, allergies, history, tests, treatment, medicine) | +50 more |
| Each second left on the clock | +2 |
| Each heart the patient loses (a wrong safety card in the signed chart) | −150 |

Points only count for cards a player checked. If time runs out, an AI team's
unchecked cards keep Scribby's guesses: they earn nothing, and if they are
wrong they still cost the patient a heart. Grades: S ≥ 1100, A ≥ 900,
B ≥ 650, C ≥ 400. Badges: CAREFUL HANDS, EAGLE EYE, PERFECT NOTES,
SPEED DEMON, and the bad ones RUBBER STAMP and OUT OF TIME.

In testing, careful play scored S for every team on every patient; an AI team
that just pressed NEXT scored B on patients 1 and 3 and D on George.

### The three patients and what goes wrong

| # | Patient | AI mistakes | Safety check | What the dentist's notes forgot |
| --- | --- | --- | --- | --- |
| 1 | Brian Tran, toothache | Tooth 36 instead of 46 (misheard) | Misses it | Wedding Saturday, fear of needles |
| 2 | George Miller, cracked tooth | Warfarin left out · "blood test normal" taken from his memory · Panadol + paracetamol (double dose) | Catches 2 of 3 | Nothing |
| 3 | Amira Haddad, bleeding gums | Pregnancy left out | Misses it | Night shifts, mornings best |
| 4 (backup) | Daniel Okafor, swollen gum by a wisdom tooth | Diabetes left out · Amoxil + amoxicillin (double dose) | Catches both | Chef, Mondays only |
| 5 (backup) | Sofia Reyes, chipped front tooth after a bike fall | "Tetanus shot up to date" taken from her memory | Misses it | Job interview Thursday |
| 6 (backup) | Kenji Watanabe, sore gums under a new denture | Latex allergy misheard as lactose | Misses it | Choir concert Sunday |

Patients 1 to 3 are open by default. The backups (4 to 6) are off until you
tick them in ⚙ Settings, for example if a group finishes early or a patient
should be swapped.

The safety check also raises one false alarm per patient on a correct card.

### How close is this to real life?

| In the game | In real life | Source |
| --- | --- | --- |
| 5 AI mistakes in 24 chart cards (about 20%, roughly 4× the real rate) | About 1.5% of AI-note sentences made up and 3.5% left out; most mistakes are things left out | Asgari et al., npj Digital Medicine 2025 (about 13,000 sentences) |
| Two of three notes have one mistake; one note has three | Most notes are fine, which is why people stop checking | MGB case: "we weren't seeing rampant hallucinations" |
| Misheard number, history left out, patient's memory as fact, one drug under two names | The same failures at MGB: "normal" MRI, Vimpat + lacosamide, notes that start blank, the 3% that matters | HBS case 9-126-061, pages 6–7, Exhibit 6 |
| The AI team is usually much faster | Doctors reported 90 → 30 minutes after work (survey); a randomized trial measured about 10% less time per note with one tool and no clear change with another | Case Exhibit 4; UCLA trial, NEJM AI 2025 (238 doctors) |
| One false alarm per chart | Doctors click past 72–93% of drug-allergy warnings | Hospital alert studies, 2014–2025 |
| The handwritten notes forget personal details | "I used to worry … that I would forget something" (David Ting); AI notes captured more of the visit (Dr. Moura) | HBS case, pages 5–6 |
| Each chart item is a multiple-choice card | Real AI scribes write a text note; some vendors are starting to fill forms and orders | HBS case, page 8 |

The game deliberately uses more mistakes than real tools make, so players find
something within the time limit. The board says so on the reveal screen and shows the
real numbers next to the class results.

## Game 4: Build StyleMod's AI (Part 3, 61:00 to 90:00)

Same room, same phones, no new scan. Part 3 uses StyleMod, the online
clothing retailer from the marketing vignettes (the AI predicts who will buy or leave
and drafts emails; a marketer approves; the email goes to 4 million
subscribers). Each team designs StyleMod's AI system in the session guide's
seven boxes (business decision, data
and evidence, AI role, human judgment, decision right, action and workflow,
feedback and learning) by picking one of three answer cards per box. The
board then runs StyleMod for six months, two chaos cards hit every
system, each team fixes ONE box, and the board runs it again.

**Teams come from the Game 1 groups:** Group A is Team 1 (left), B is Team 2
(middle), C is Team 3 (right), in the Game 3 team colours. A late joiner lands
in the smallest group.

**The safety rule.** Building and fixing are self-paced on the phones: each
phone moves between boxes on its own (BACK, NEXT, or a tap in the list of
boxes), and nothing the projector does moves a phone or clears a pick. The
board only switches between big steps. Moving on while a team is not done
asks first ("Team 3 has 6 of 7 boxes. Move on anyway?", "Team 3 has not
picked its fix yet."); going back never asks and never loses anything.
Clocks never close anything. To clear Game 4 on purpose, use **Start Game 4
again** on the Game 4 intro screen (it asks first; Games 1 to 3 are kept).

| Step (top bar) | Time | Projector | Phones |
| --- | --- | --- | --- |
| Class scores | at 61:00, after the StyleMod case slide and the deck's GAME 4 cue slide (Ctrl+2) | **GAME 4 ▶** (top right) | their score |
| GAME 4 (intro) | 1 min | "GAME 4 · BUILD STYLEMOD'S AI", one line, who is in each team | "Team 1 · Left. Your team builds the system on your phones." |
| BUILD | 8 min (board clock, ⚙ to change) | "Build your team's StyleMod system: 7 boxes, one card each." and 7 squares per team filling as boxes are decided | one box per screen: the full question, one line ("Talk with your team first, then tap.", "Your team is split: 2 picked your card, 1 picked another. Talk it over.", "Your team agrees."), the three cards, BACK and NEXT; after Box 7 the team's whole system |
| RUN 1/2 | 3 min | "SIX MONTHS LATER": per team marketer work (90 → N hours per campaign), harmful emails sent (per 100,000), unsubscribes (±N%), and up to 3 story lines, each naming its box ("Box 4: Reading every email takes so long that marketers skim, and campaigns go out late.") | the team's numbers and every story line |
| RUN 2/2 (debate) | 2 min | the ONE box where the teams disagree most, each team's card, "Team 2, convince Team 3 in 30 seconds." and a 30-second clock (Again restarts it). Skipped when the teams chose the same everywhere | who speaks, who answers |
| CHAOS 1/2 | 1 min | two chaos cards, the same two failures as the deck: A Automation bias (rubber stamp), D Wrong KPI (clicks up, customers down) | "Chaos cards! Look up." |
| CHAOS 2/2 | 3 min | per team "Survived" or "Broke at Box 4 · Human judgment", with the reason, and the harmful emails and unsubscribes after the hit | whether their system broke, and where |
| FIX | 4 min (board clock) | "Fix ONE box": per team "Choosing a fix…", "Fixing Box 4…", "Fixed Box 4 · Human judgment" | the boxes, the broken one first; open one, pick a different card (the team's current card is locked) |
| RERUN 1/2 | 5 min | version 1 → version 2 with both chaos cards again, where it still breaks, the score (was → now) and the WINNER | their version 2 numbers and score; "Explain your fix out loud" |
| RERUN 2/2 | 2 min | the closing line ("Data-driven decision making is not more data or more AI…") | the same line |

**A team's card** for a box is the card most of its members picked; on a tie,
the card that was picked first. The box a team fixes, and its new card, are
chosen the same way. A box nobody decided counts as its weak card ("Nobody
decided Box 7, so nobody owns it.").

**The numbers.** Every card moves three numbers from StyleMod before the AI
(90 marketer hours per campaign, 6 harmful emails per 100,000, unsubscribes
0%). Card A breaks the system at Box 4 unless Box 4 is "a marketer picks the
final message and checks sensitive topics", or else at Box 5 if everything is
AUTO (+5 harmful emails). Card D breaks it at Box 7 unless Box 7 tracks sales,
unsubscribes and complaints monthly, or else at Box 1 if the plan was to expand now for more clicks
(+15% unsubscribes). The score (shown as a number only) is
100 − (hours − 48) ÷ 4 − 3 × harmful emails − (unsubscribes + 20) ÷ 2, never
below 0: the best system scores 100, StyleMod before the AI 62. Game 4 does not add to the class score. All text, effects and rules are in
`src/demo/game4.ts`.

**Backup.** If the Wi-Fi fails, run Part 3 from the Slides deck, hands up:
the StyleMod case slide, the seven question slides and the two failure
slides (wrong KPI, automation bias). An older online Part 3
(part3.tecxmate.com), where every phone followed the presenter's clicks,
stays in the dental-ai repo (`part3/` on the class branch); it is not used.

## Suggested run (about 21 minutes)

1. **Join (2 min).** Open `#board`. Everyone scans the QR code and types a
   nickname. Ask people to sit with their group letter (A, B or C).
2. **Game 1 (3 min).** Press START GAME 1. Walk around and listen; send a hint
   if the room is quiet.
3. **Game 1 answers (2 min).** Groups guess first, then step through the
   stats, the three mistake cards, the real-case quote and the top 5. Use the
   lecturer line at the bottom of each step.
4. **Game 2 (1 min + 2 min answers).** "You are a busy doctor with 20 patients
   today." Phones down, START, 8 seconds, vote, then hands up: "Who signed?
   Keep your hand up if you saw the problem." Then the note, the stats and the
   poll.
5. **Game 3 join (2 min).** Press NEXT to open The Clinic. Count off into 3
   teams, then into groups of three inside each team: one dentist, two nurses.
   Everyone picks the team and their job on the phone. Start when the phone
   count matches the room and no clinic chip is yellow.
6. **Play (5 min).** Everyone starts with Patient 2, George (the most
   mistakes), or give each clinic a different patient. Each chart has its own
   90-second countdown on the phone; the board timer is for the whole round.
7. **Live results (1 min).** "Who would you want as your dentist?"
8. **Reveal (2 min).** Open "AI mistakes" to see which teams got each planted
   mistake right, then "Real world" for the real numbers.
9. **Discuss (1–2 min).** Open "Discuss" and pick one or two questions.
10. **Class scores (1 min).** Press "Class scores ▶" and congratulate the top
    three.
11. **Game 4 (61:00 to 90:00).** After the deck's StyleMod case slide and the GAME 4 cue slide, Ctrl+2, press **GAME 4 ▶** on Class scores and follow
    the table in "Game 4: Build StyleMod's AI".

## Files

- `src/demo/game4.ts`: Game 4's boxes, cards, effects, chaos rules, scoring and team majority (shared by the Worker, the projector and the phones); `src/demo/flow/Game4Host.tsx` and `Game4Board.tsx` the projector, `Game4Player.tsx` the phone, `game4.css` both
- `demo/index.html`, `src/demo/*`: the page (`vite.demo.config.ts` builds it into `dist-demo/`)
- `src/demo/scenarios.ts`: patients 1 to 3 (visit lines, notes, cards, answers, Scribby's picks, safety-check rules) and the renaming; `src/demo/scenarios-backup.ts`: backup patients 4 to 6.
- `src/demo/scoring.ts`: points, grades and badges
- `src/demo/Station.tsx`, `src/demo/quest.css`, `src/demo/game/`: the phone game (screens, pixel scene, sounds)
- `src/demo/Board.tsx`, `src/demo/demo.css`: the Game 3 projector board
- `src/demo/flow/`: Games 1 and 2 (`content.ts` has every note and line of text, `Player.tsx` the phone, `Host.tsx` the projector, `flow.css` the light look)
- `demo/worker.ts`, `demo/wrangler.jsonc`: the Cloudflare Worker that keeps the room: who joined, every answer, results and what each dentist is doing
