@echo off
rem 旅の手帳の表現を PC の声で音声にする。ダウンロードフォルダのいちばん新しいバックアップを使います。
cd /d "%~dp0.."
node scripts\build-my-audio.mjs %*
pause
