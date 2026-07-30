import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MOODS = ['lazy', 'average', 'good', 'great', 'excellent'];

// One exercise row in the "Workout Details" list - metrics are all optional
// since not every exercise reports the same ones (Running tracks distance,
// Strength Training tracks calories, etc).
const exerciseSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  durationMinutes: Joi.number().integer().min(0).max(1440).allow(null),
  calories: Joi.number().integer().min(0).max(20000).allow(null),
  distanceKm: Joi.number().min(0).max(1000).allow(null),
});

const dateParamSchema = Joi.object({
  date: Joi.string().pattern(DATE_PATTERN).required(),
});

const upsertFitnessLogSchema = Joi.object({
  mood: Joi.string().valid(...MOODS).allow(null),
  steps: Joi.number().integer().min(0).max(200000).allow(null),
  calories: Joi.number().integer().min(0).max(20000).allow(null),
  workoutMinutes: Joi.number().integer().min(0).max(1440).allow(null),
  activeCalories: Joi.number().integer().min(0).max(20000).allow(null),
  distanceKm: Joi.number().min(0).max(1000).allow(null),
  floorsClimbed: Joi.number().integer().min(0).max(1000).allow(null),
  weightKg: Joi.number().min(0).max(500).allow(null),
  bodyFatPercent: Joi.number().min(0).max(100).allow(null),
  waterIntakeLiters: Joi.number().min(0).max(50).allow(null),
  sleepHours: Joi.number().min(0).max(24).allow(null),
  exercises: Joi.array().items(exerciseSchema).max(30).allow(null),
  notes: Joi.string().max(1000).allow('', null),
});

const listFitnessDatesSchema = Joi.object({
  from: Joi.date().iso().required(),
  to: Joi.date().iso().required(),
});

export const validateFitnessDateParam = validate(dateParamSchema, 'params');
export const validateUpsertFitnessLog = validate(upsertFitnessLogSchema);
export const validateListFitnessDates = validate(listFitnessDatesSchema, 'query');
