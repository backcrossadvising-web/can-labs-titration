// Can Labs Titration Calculator — math module
// Source: Titration_and_Flower_to_Extract_Conversion_v1_1.xlsx
// All doses in grams (extract or flower). All THC values in mg unless noted.

export const DEFAULTS = Object.freeze({
  thcMgPerG: 572,        // Total THC of reference batch CN2602CP070H (57.2% w/w)
  safetyFactor: 0.5,     // Week-1 conversion safety factor (≈50% prior THC)
  roundIncrement: 0.025, // Practical rounding increment for extract dose (g)
  minDose: 0.05,         // Practical minimum per-session extract dose (g)
  dailyMax: 0.30,        // Hard daily ceiling (10 g / month Rx maximum)
});

const mround = (value, multiple) => Math.round(value / multiple) * multiple;
const sessionsUnderCap = (perDose, dailyMax) =>
  perDose <= 0 ? Infinity : Math.floor(dailyMax / perDose + 1e-9);

export function computeConversion(inputs, params = DEFAULTS) {
  const { flowerPctTHC, massPerSession, sessionsPerDay } = inputs;
  const { thcMgPerG, safetyFactor, roundIncrement, minDose } = params;

  const loadedTHCperSession = flowerPctTHC * 10 * massPerSession;
  const dailyFlowerMass = massPerSession * sessionsPerDay;
  const dailyLoadedTHC = loadedTHCperSession * sessionsPerDay;
  const extractEquivPerSession = loadedTHCperSession / thcMgPerG;

  const week1StartingDose = Math.max(
    minDose,
    mround(extractEquivPerSession * safetyFactor, roundIncrement),
  );

  const safetySessions =
    week1StartingDose * thcMgPerG === 0
      ? sessionsPerDay
      : Math.ceil((dailyLoadedTHC * safetyFactor) / (week1StartingDose * thcMgPerG));

  const capSessions = sessionsUnderCap(week1StartingDose, params.dailyMax);
  const week1SessionsUncapped = Math.max(1, Math.min(sessionsPerDay, safetySessions));
  const week1Sessions = Math.max(1, Math.min(week1SessionsUncapped, capSessions));
  const week1DailyCapped = week1Sessions < week1SessionsUncapped;

  const week1DailyDose = week1StartingDose * week1Sessions;
  const week1DailyTHC = week1DailyDose * thcMgPerG;
  const pctOfPriorTHC = dailyLoadedTHC === 0 ? 0 : week1DailyTHC / dailyLoadedTHC;

  return {
    loadedTHCperSession,
    dailyFlowerMass,
    dailyLoadedTHC,
    extractEquivPerSession,
    week1StartingDose,
    week1Sessions,
    week1DailyDose,
    week1DailyTHC,
    week1DailyCapped,
    pctOfPriorTHC,
  };
}

export function experiencedSchedule(inputs, conversion, params = DEFAULTS) {
  const { sessionsPerDay } = inputs;
  const { extractEquivPerSession } = conversion;
  const { roundIncrement, minDose, dailyMax } = params;

  const week2PerDose = Math.max(minDose, mround(extractEquivPerSession * 0.75, roundIncrement));
  const week3PerDose = Math.max(minDose, mround(extractEquivPerSession, roundIncrement));

  const dailyLoadedTHC = conversion.dailyLoadedTHC;
  const pct = (dose, doses) =>
    dailyLoadedTHC === 0 ? 0 : (dose * doses * params.thcMgPerG) / dailyLoadedTHC;

  const cap = (perDose, requested) => {
    const allowed = Math.max(1, Math.min(requested, sessionsUnderCap(perDose, dailyMax)));
    return { doses: allowed, capped: allowed < requested };
  };
  const w2 = cap(week2PerDose, sessionsPerDay);
  const w3 = cap(week3PerDose, sessionsPerDay);

  return [
    {
      week: 'Week 1',
      timing: 'Reduced frequency to honour safety factor',
      perDose: conversion.week1StartingDose,
      doses: conversion.week1Sessions,
      daily: conversion.week1DailyDose,
      capped: !!conversion.week1DailyCapped,
      pct: conversion.pctOfPriorTHC,
      notes:
        'Per-session dose at practical minimum; sessions/day reduced so daily THC ≈ 50% of prior. Clinician check-in at end of week 1.',
    },
    {
      week: 'Week 2',
      timing: 'Split doses',
      perDose: week2PerDose,
      doses: w2.doses,
      daily: week2PerDose * w2.doses,
      capped: w2.capped,
      pct: pct(week2PerDose, w2.doses),
      notes: 'Increase to ~75% of prior THC if tolerated.',
    },
    {
      week: 'Week 3 (full conversion)',
      timing: 'Split doses',
      perDose: week3PerDose,
      doses: w3.doses,
      daily: week3PerDose * w3.doses,
      capped: w3.capped,
      pct: pct(week3PerDose, w3.doses),
      notes: 'Match prior daily THC as closely as practical increments allow.',
    },
    {
      week: 'Week 4+ (optimise)',
      timing: 'Individualised',
      perDose: null,
      doses: null,
      daily: null,
      capped: false,
      pct: null,
      notes: 'Adjust per symptom control. Consolidate to BID or TDS as clinically appropriate.',
    },
  ];
}

export function naiveSchedule(params = DEFAULTS) {
  const { thcMgPerG } = params;
  const row = (week, timing, perDose, doses, notes) => ({
    week,
    timing,
    perDose,
    doses,
    daily: perDose === null || doses === null ? null : perDose * doses,
    dailyTHC: perDose === null || doses === null ? null : perDose * doses * thcMgPerG,
    notes,
  });
  return [
    row('Week 1', 'Evening only', 0.05, 1, 'Single evening dose. Specialist review at month 1; clinician check-in end of week 1. No driving for 6 h after dose.'),
    row('Week 2', 'Evening only', 0.075, 1, 'Escalate only if all four criteria met. Otherwise hold.'),
    row('Week 3', 'Morning + Evening', 0.05, 2, 'BID trial. Assess daytime function.'),
    row('Week 4a (preferred)', 'Morning + Evening', 0.10, 2, 'BID at 0.10 g if daytime tolerance good.'),
    row('Week 4b (alternative)', 'Evening only', 0.15, 1, 'Single larger evening dose if daytime sedation concerns.'),
    row('Week 5+', 'Individualised', null, null, 'Move onto Experienced-style maintenance once stable. Review monthly.'),
  ];
}

export function breakthroughSchedule() {
  return [
    {
      phase: 'PRN-1',
      setting: 'Initial PRN',
      perRescue: 0.05,
      minIntervalMin: 120,
      maxRescues: 2,
      maxDaily: 0.10,
      notes: 'Start at 0.05 g. Log every rescue for monthly review; clinician check-in if rescue frequency escalates.',
    },
    {
      phase: 'PRN-2',
      setting: 'Escalation',
      perRescue: 0.075,
      minIntervalMin: 90,
      maxRescues: 3,
      maxDaily: 0.225,
      notes: 'Escalate only if PRN-1 insufficient AND tolerated.',
    },
    {
      phase: 'PRN-3',
      setting: 'Maximal PRN',
      perRescue: 0.10,
      minIntervalMin: 90,
      maxRescues: 3,
      maxDaily: 0.30,
      notes: 'Plateau. If more frequently required, re-review baseline dose.',
    },
  ];
}

export function referenceTable(flowerPctTHC, params = DEFAULTS) {
  const { thcMgPerG, safetyFactor, roundIncrement, minDose, dailyMax } = params;
  const masses = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.75, 1.00];
  return masses.map((m) => {
    const loadedTHC = m * flowerPctTHC * 10;
    const extractEquiv = loadedTHC / thcMgPerG;
    const week1 = Math.max(minDose, mround(extractEquiv * safetyFactor, roundIncrement));
    const uncappedDaily3x = week1 * 3;
    const cappedDaily3x = Math.min(uncappedDaily3x, dailyMax);
    return {
      mass: m,
      loadedTHC,
      dailyFlower3x: m * 3,
      dailyTHC3x: loadedTHC * 3,
      extractEquiv,
      week1Start: week1,
      week1Daily3x: cappedDaily3x,
      week1Daily3xCapped: cappedDaily3x < uncappedDaily3x,
    };
  });
}

export const REVIEW_TRIGGERS = [
  {
    point: 'Month 1 (initiation)',
    assess: 'Tolerability; symptom trajectory vs baseline; sleep/mood; device use; PHQ-9/GAD-7; BP; driving exposure; formal effect assessment.',
    action: 'Hold dose. Do not escalate. Downgrade if adverse effects troublesome. If no benefit, consider alternative cultivar or route, not dose-escalation.',
  },
  {
    point: 'Months 2–6 (monthly)',
    assess: 'Repeat month-1 assessment + function and diversion screen from month 2.',
    action: 'If response inadequate AND tolerated, proceed to optimisation. If response inadequate AND poorly tolerated, taper off.',
  },
  {
    point: 'Months 7–12 (quarterly)',
    assess: 'Adherence; cumulative dose review; new driving/occupational risks; psychiatric screen; cardiovascular review; labs as indicated.',
    action: 'Consider dose reduction trial every 6 months. Stop if any psychiatric red flag.',
  },
  {
    point: 'Annual (year 2+)',
    assess: 'Full long-term continuation review per CDST A.4.',
    action: 'Active review, not default continuation.',
  },
  {
    point: 'Interim check-in',
    assess: 'Triggered by dose milestone, dose change, AE, or patient concern. Single-variable escalation only (dose OR frequency OR cultivar).',
    action: 'Reinstate prior regimen if tolerability worsens. Escalate to unscheduled specialist review if red flag.',
  },
];

export const RED_FLAGS = [
  { category: 'Psychiatric', detail: 'New psychotic symptoms, mania, severe anxiety, suicidal ideation.' },
  { category: 'Cardiovascular', detail: 'New or worsening angina, arrhythmia, uncontrolled hypertension, syncope.' },
  { category: 'Cognitive / safety', detail: 'Impaired driving, occupational injury, fall or near-fall attributable to drug.' },
  { category: 'Dependence / diversion', detail: 'Lost/stolen prescription pattern, requests for early supply, evidence of sharing.' },
  { category: 'Pregnancy / lactation', detail: 'Positive pregnancy test or planned conception during treatment.' },
];

export const ESCALATION_CRITERIA = [
  'Tolerability acceptable (no troublesome cognitive, cardiovascular, or psychiatric effects)',
  'Symptom improvement insufficient at current step',
  'No concerns on mood, sleep, or psychosis screen',
  'Device adherence and correct technique confirmed',
];
