# Jarvis 3D Git Upload Package

This folder is a lightweight Git-upload version of the project. It excludes large runtime folders and heavy 3D model assets so the total size stays under 25 MB.

## Included
- Source code in src/
- Public static SVG assets in public/
- Next.js, TypeScript, ESLint, and package config files

## Excluded to keep upload size small
- node_modules/
- .next/
- .env.local
- API key.txt
- Large .glb model files

## Before running
Create a .env.local file with:

OPENAI_API_KEY=your_key_here

Then place these model files into public/models/:
- new_york_city.glb
- male_human_skeleton_-_zbrush_-_anatomy_study.glb
- adam_smasher_cyberpunk.glb

## Run
npm install
npm run dev
