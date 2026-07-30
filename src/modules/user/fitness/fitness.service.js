import { pool } from '../../../config/db.js';

const emptyLog = (date) => ({
  log_date: date,
  mood: null,
  steps: null,
  calories: null,
  workout_minutes: null,
  active_calories: null,
  distance_km: null,
  floors_climbed: null,
  weight_kg: null,
  body_fat_percent: null,
  water_intake_liters: null,
  sleep_hours: null,
  exercises: [],
  notes: null,
});

export const getFitnessLog = async (userId, date) => {
  const [rows] = await pool.query('SELECT * FROM fitness_logs WHERE user_id = ? AND log_date = ?', [userId, date]);
  if (!rows[0]) return emptyLog(date);
  return { ...rows[0], exercises: rows[0].exercises || [] };
};

// Always a full-form save (the screen submits every field each time), same
// as business-card - upsert rather than COALESCE, so clearing a field back
// to blank actually clears it instead of keeping the old value.
export const upsertFitnessLog = async (userId, date, payload) => {
  const {
    mood,
    steps,
    calories,
    workoutMinutes,
    activeCalories,
    distanceKm,
    floorsClimbed,
    weightKg,
    bodyFatPercent,
    waterIntakeLiters,
    sleepHours,
    exercises,
    notes,
  } = payload;
  await pool.query(
    `INSERT INTO fitness_logs
      (user_id, log_date, mood, steps, calories, workout_minutes, active_calories, distance_km,
       floors_climbed, weight_kg, body_fat_percent, water_intake_liters, sleep_hours, exercises, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       mood = VALUES(mood),
       steps = VALUES(steps),
       calories = VALUES(calories),
       workout_minutes = VALUES(workout_minutes),
       active_calories = VALUES(active_calories),
       distance_km = VALUES(distance_km),
       floors_climbed = VALUES(floors_climbed),
       weight_kg = VALUES(weight_kg),
       body_fat_percent = VALUES(body_fat_percent),
       water_intake_liters = VALUES(water_intake_liters),
       sleep_hours = VALUES(sleep_hours),
       exercises = VALUES(exercises),
       notes = VALUES(notes)`,
    [
      userId,
      date,
      mood ?? null,
      steps ?? null,
      calories ?? null,
      workoutMinutes ?? null,
      activeCalories ?? null,
      distanceKm ?? null,
      floorsClimbed ?? null,
      weightKg ?? null,
      bodyFatPercent ?? null,
      waterIntakeLiters ?? null,
      sleepHours ?? null,
      JSON.stringify(exercises || []),
      notes || null,
    ]
  );
  return getFitnessLog(userId, date);
};

// Which dates in [from, to] already have a log - lets the day-strip show a
// dot under days with data without fetching every field for every day.
export const listFitnessDates = async (userId, from, to) => {
  const [rows] = await pool.query(
    'SELECT log_date FROM fitness_logs WHERE user_id = ? AND log_date BETWEEN ? AND ? ORDER BY log_date',
    [userId, from, to]
  );
  return rows.map((r) => r.log_date);
};
