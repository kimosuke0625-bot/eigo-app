@echo off
rem 音声の作成を始める（または続きから再開する）。このウィンドウを閉じると止まります。
cd /d "%~dp0.."
node scripts\build-audio-bank.mjs
pause
