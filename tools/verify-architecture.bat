@echo off
setlocal

cd /d "%~dp0.."

node tools\generate-contract.mjs --check
if errorlevel 1 exit /b %errorlevel%

node tools\check-boundaries.mjs
if errorlevel 1 exit /b %errorlevel%

python tools\check_python_orphans.py
if errorlevel 1 exit /b %errorlevel%

python -m pyright
if errorlevel 1 exit /b %errorlevel%

node --test tests\*.test.mjs
if errorlevel 1 exit /b %errorlevel%

python -m unittest discover -s tests -p "test_*.py"
if errorlevel 1 exit /b %errorlevel%

python -m py_compile server\app.py
if errorlevel 1 exit /b %errorlevel%

for %%F in (server\windup_pipeline\*.py) do (
  python -m py_compile "%%F"
  if errorlevel 1 exit /b 1
)

for /r asset-lab %%F in (*.js *.mjs) do (
  node --check "%%F"
  if errorlevel 1 exit /b 1
)

for /r tools %%F in (*.js *.mjs) do (
  node --check "%%F"
  if errorlevel 1 exit /b 1
)

git diff --check
if errorlevel 1 exit /b %errorlevel%

echo Architecture verification OK.
