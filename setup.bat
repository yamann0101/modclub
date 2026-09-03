@echo off
title MOD CLUB Kurulum
cd /d "%~dp0"
node setup.mjs
if errorlevel 1 pause
