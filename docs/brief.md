# Pole Choreo Planner — Project Brief

## What this is

A visual tool to load a song, label its structural sections, and fill in the
shapes/holds for a pole choreography — built around a "hold every shape at
least 3 seconds" constraint.

Companion tool for a choreography project set to "Code Mistake" (CORPSE x
Bring Me the Horizon) — 143 BPM, 2:45 long.

## Core features

**Audio & waveform**

- Load a local audio file (songs can't be redistributed, so this is always
  user-supplied, loaded fresh each session)
- Render it as a waveform (Web Audio API + canvas)
- Playback with a moving playhead

**Beat grid**

- Enter BPM (default 143), tap along to set the first-beat offset
- Draw 8-count gridlines over the waveform — at 143 BPM, one 8-count is
  ~3.4 seconds, which is the natural "one hold" unit for this project
- Full song (2:45) is roughly 49 eight-counts — a useful sanity check when
  placing shapes

**Sections**

- Click/drag on the waveform to mark section boundaries
- Label each one (verse, chorus, bridge, etc.), color-coded

**Shapes**

- Within a section, add shape entries: start time + hold duration (default
  one 8-count, adjustable)
- Two ways to add a shape: pick from a personal, reusable preset list, or
  type a free-text note — both should be available side by side
- Loop a single section for practice

## Platform

- Fully responsive — used about equally on phone (in-studio) and laptop
  (planning)
- Progressive Web App: installable, usable offline once a song is loaded
- Hosted on Firebase Hosting
- Decide early whether project data (sections/shapes/presets) syncs via
  Firestore (needed if "share" means someone else views your project) or
  stays local per device (simpler, but not shareable across devices)

## Explicitly not needed

- No automatic audio/beat-detection analysis — manual tap-tempo and manual
  section marking are intentional, they're also part of the ear-training
  goal for this project
- No music notation
