-- Nullable whole minutes: existing events keep their previous attendance calculation.
ALTER TABLE "Event" ADD COLUMN "expectedEventDuration" INTEGER;
