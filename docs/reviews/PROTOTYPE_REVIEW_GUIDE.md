# ZenRoutine prototype review guide

Build under review: https://zenroutine-web.onrender.com  
Branch: `codex/r1-data-safety`  
Baseline commit: `5c6b790`  
Review stage: R1-R3 prototype delivered through the first R4 web beta

## Why this review matters

This is not a release-candidate QA pass. The build is concrete enough to test the central idea, but several product choices are intentionally still open. The most valuable outcome is a clear view of whether ZenRoutine's loop is useful and distinctive—not a long list of cosmetic imperfections.

Try to separate three reactions as you review:

1. **Product direction:** Is this the right problem, user, and recurring payoff?
2. **Interaction design:** Is the plan → track → review loop understandable and low-friction?
3. **Defects and polish:** Does something behave incorrectly, feel broken, or look unfinished?

## Before you begin

- The web beta currently stores data only in that browser on that device. Phone, tablet, and desktop will each start with separate data.
- There is no account or cloud synchronization yet. Clearing site data or using a private window can remove that window's data.
- Do not enter sensitive personal information. Use representative but disposable goals and routines.
- Use a fresh private/incognito window for the first-run review. Use a normal window for a longer-lived test dataset.
- Record the device, operating system, browser, screen orientation, and approximate time whenever something fails.

## Fast review — 15 minutes

Use this when you want a high-level read before a deeper walkthrough.

- [ ] Read the onboarding without clicking ahead immediately. Can you describe what the product is for in one sentence?
- [ ] Create one real-world goal with an estimate and priority.
- [ ] Build enough of a weekly routine to allocate time to that goal.
- [ ] Return Home and start a planned or quick tracking session.
- [ ] Stop it and follow the `Review week` handoff.
- [ ] Look at the forecast and decide whether you trust and understand it.
- [ ] Close/reopen the site and confirm your data remains.

Then write three sentences:

1. “I think this product is for …”
2. “The moment that felt most valuable was …”
3. “The main reason I might not return tomorrow is …”

## Guided product review — 45 to 60 minutes

### 1. First-run promise

Open the site in a fresh private window and review onboarding.

Pay particular attention to:

- Who you believe the intended user is.
- Whether “goals”, “routine”, “tracking”, and “prediction” form one coherent promise.
- Whether the language overpromises intelligence or automation.
- What you expect to happen immediately after onboarding.

Questions:

- Is ZenRoutine primarily a routine planner, a goal-focused time tracker, or a life-balance tool?
- What existing product or manual habit would it replace?
- What result should a user see within their first day? Within their first week?

### 2. Goal model

Create two goals that use the same activity type but have different priorities. Give them estimates that feel realistic to you.

Check:

- [ ] Creating a goal is understandable without instruction.
- [ ] “Estimated time” has a clear meaning.
- [ ] The five priority levels feel useful rather than artificially precise.
- [ ] Pausing, completing, and reopening progress behave as expected.
- [ ] Two competing goals do not appear to receive the same scheduled time twice.

Feedback wanted:

- Would you estimate a goal in minutes/hours, sessions, milestones, or a target date?
- Should priority control allocation automatically, or should the user allocate time directly?
- Are activity types valuable structure or extra setup work?

### 3. Weekly planning

Create a small but realistic routine. Include:

- One block linked directly to a goal.
- One block for the same activity type but not linked to a goal.
- One block for a different activity.
- If practical, an evening or overnight block.

Check:

- [ ] Adding, editing, and deleting blocks is discoverable.
- [ ] The weekly layout works with touch as well as a mouse.
- [ ] Goal-linked versus general activity time is visually understandable.
- [ ] You can recover easily from an incorrect time or day.
- [ ] The amount of setup feels proportionate to the promised value.

Feedback wanted:

- Would you build a full ideal week, plan only the next few days, or import a calendar?
- Which planning action feels slowest or most repetitive?
- Should the routine represent intention, availability, commitment, or a calendar reservation?

### 4. Plan → track → review loop

On Home, try both paths:

1. Start from a scheduled block.
2. Start from Quick Start and choose whether to link a goal.

Let one timer run briefly, stop it, then select `Review week`.

Check:

- [ ] It is obvious what is currently being tracked.
- [ ] Starting and stopping feels safe and reversible.
- [ ] The link between activity, goal, routine block, and recorded time makes sense.
- [ ] The saved-session confirmation provides useful reassurance.
- [ ] Analytics answers the question you expected after stopping.

Feedback wanted:

- Would you reliably start/stop a timer, or do you need retrospective entry and correction to be first-class?
- What should Home show to persuade you to act now?
- What would create a useful daily or weekly habit loop?

### 5. Forecast credibility

Review both same-activity goals after assigning routine capacity.

The prototype currently assumes:

- Goal-linked blocks are dedicated to that goal.
- Unlinked time for an activity is shared between active goals using five priority weights, from 5 to 1.
- Shared time is reallocated when a goal is forecast to finish.
- Time linked to another or inactive goal remains reserved.
- Confidence describes the amount and recency of tracking evidence; it is not a statistical probability.

Check:

- [ ] You can explain why each goal received its weekly allocation.
- [ ] The completion date feels helpful rather than falsely authoritative.
- [ ] “Low confidence” and its explanation change how much you trust the date.
- [ ] No-capacity and reserved-capacity states tell you what action to take.

This is one of the highest-value feedback areas:

- Should prediction be the headline feature, supporting feedback, or removed until more evidence exists?
- Would a range be more credible than a date?
- Should actual adherence influence the forecast more strongly than the planned routine?
- Should paused/inactive-goal capacity become available automatically?
- Does automatic priority weighting match your mental model?

### 6. Analytics and correction

Create a few short tracking entries across different activities, then explore Analytics and Calendar.

Check:

- [ ] Planned versus tracked time is easy to compare.
- [ ] The most important discrepancy is visually prominent.
- [ ] Editing, reassigning, or deleting incorrect time feels safe.
- [ ] Goal progress updates consistently after a correction.
- [ ] Empty states explain what to do next.

Feedback wanted:

- Which single weekly insight would be worth returning for?
- Do you care more about goals, category balance, schedule adherence, or total focused time?
- What should the product recommend when plan and reality diverge?

### 7. Data trust and portability

In Settings, export a backup and confirm it contains text. Do not paste its contents into a public bug report. If your dataset is disposable, try an invalid import and then a valid restore.

Check:

- [ ] Reloading preserves the current browser's data.
- [ ] Invalid backup data is rejected without replacing live data.
- [ ] Export/import language communicates the consequences clearly.
- [ ] Reset behavior requires enough intent and leaves the app usable.

Questions:

- Is local-only guest mode valuable once accounts exist?
- On first sign-in, would you expect this device to upload automatically, ask first, or remain separate?
- For a conflict between phone and desktop, would you prefer choosing one complete version or resolving individual items?

## Device passes

### Phone browser

- [ ] Test portrait and landscape.
- [ ] Check bottom navigation, modals, forms, and the on-screen keyboard.
- [ ] Try routine editing with touch.
- [ ] Leave the browser during an active timer, return, and confirm elapsed time.
- [ ] Lock the device briefly during a timer and confirm recovery.

### Tablet browser

- [ ] Test portrait and landscape.
- [ ] Look for stretched content, unused space, or controls that are too far apart.
- [ ] Decide whether the experience should remain phone-like or use a tablet-specific layout.

### Desktop browser

- [ ] Test keyboard navigation and visible focus.
- [ ] Press Escape to dismiss an open form/modal.
- [ ] Resize from narrow to wide and watch for clipped or overly stretched content.
- [ ] Confirm the interface is useful with a mouse, not merely functional.

## Known prototype state

These are known boundaries, not surprising review discoveries. Feedback on their product impact is still welcome.

- Authentication and cloud synchronization are not implemented; every browser/device has independent local data.
- The public deployment is a web beta from a Codex branch, not a release from `main`.
- EAS profiles are configured, but no installable native build has been produced yet.
- Native safe areas, gestures, keyboard behavior, background/resume, share sheets, VoiceOver/TalkBack, Dynamic Type, and physical touch targets remain manually unverified.
- The application intentionally uses a light appearance; a complete dark theme is not present.
- Notifications and reminders are not implemented. Earlier placeholders were removed instead of pretending to work.
- Forecast weights and confidence thresholds are explicit prototype assumptions, not validated behavioral science.
- Very short completed sessions can display as `0m` because the current UI rounds duration to minutes.
- Some screens and the central store remain large. Refactoring is being driven by active feature pressure rather than done speculatively.
- Remaining dependency advisories are largely transitive tooling issues. They were reduced through supported Expo upgrades and have not been force-fixed.
- Browser success does not prove App Store/Play Store behavior or long-running native timer reliability.

## Feedback priority

Please prioritize feedback in this order:

1. **Product thesis:** intended user, problem, substitute, and distinctive payoff.
2. **Repeatable loop:** whether planning, tracking, and review form a habit worth repeating.
3. **Forecast value and trust:** whether it changes decisions or merely adds noise.
4. **Mental model:** goals, activity types, routine blocks, priorities, and tracked sessions.
5. **Friction:** setup cost, missing corrections, confusing navigation, and repetitive actions.
6. **Cross-device expectations:** guest mode, sign-in, synchronization, conflicts, and privacy.
7. **Polish and defects:** visual quality, responsiveness, accessibility, errors, and broken behavior.

## Copyable review report

```text
ZenRoutine prototype review

Device / OS / browser:
Review duration:
Fresh start or existing data:

PRODUCT
- I think ZenRoutine is for:
- It would replace or complement:
- Most valuable moment:
- Main reason I might not return:
- Prediction should be: headline / supporting / deferred
- Web should be: full product / companion / demo only

CORE LOOP (1-5, plus notes)
- Goal setup clarity:
- Routine planning clarity:
- Starting/stopping tracking:
- Review/analytics usefulness:
- Forecast understandability:
- Forecast trust:

TOP THREE CHANGES
1.
2.
3.

DEFECTS
- Steps:
- Expected:
- Actual:
- Did reload change it?
- Screenshot/video available?

CONNECTED MODE
- Is local-only guest mode important?
- Preferred sign-in method:
- Expected first-sign-in data behavior:
- Acceptable conflict behavior:
- Data/privacy concerns:

Anything else:
```

## What happens after the review

The feedback should result in a short product decision note covering the first user, first-week payoff, role of prediction, web's role, and connected-mode expectations. Only then should the next roadmap be expanded beyond the already-defined native beta and safe synchronization work.
