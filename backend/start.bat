@echo off
rem ===================================================================
rem  start.bat -- launch the BU Big Backs backend API (Windows).
rem
rem  Windows equivalent of start.sh. Self-initializing: on first run it
rem  creates a Python virtualenv in backend\.venv and installs
rem  requirements.txt; on later runs it reuses them. Then it launches
rem  server.py, which runs the dining poller daily and serves the JSON
rem  API. The frontend is hosted separately and is not started here.
rem
rem  Ctrl-C stops the server.
rem ===================================================================

setlocal EnableExtensions

rem Operate from the directory this script lives in.
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%"

rem Pick a base Python interpreter: prefer the py launcher, else python.
set "BASE_PY="
where py >nul 2>&1 && set "BASE_PY=py"
if not defined BASE_PY (
  where python >nul 2>&1 && set "BASE_PY=python"
)
if not defined BASE_PY (
  echo start.bat: no python interpreter found.>&2
  popd
  exit /b 1
)

set "VENV_DIR=%SCRIPT_DIR%.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "REQUIREMENTS=%SCRIPT_DIR%requirements.txt"

rem -------------------------------------------------------------------
rem Initialize the Python environment.
rem
rem Dependencies (pandas, numpy) are kept in a local virtualenv so the
rem system Python stays clean and runs are reproducible. The venv and its
rem packages are created/installed only when missing, so repeat starts
rem are fast.
rem -------------------------------------------------------------------
if not exist "%VENV_PY%" (
  echo [start] Creating Python virtualenv at %VENV_DIR%...
  %BASE_PY% -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo start.bat: failed to create virtualenv.>&2
    popd
    exit /b 1
  )
)

rem Install dependencies if any required package is missing. A quick
rem import check avoids a pip run on every start once things are in place.
"%VENV_PY%" -c "import pandas, numpy" >nul 2>&1
if errorlevel 1 (
  if not exist "%REQUIREMENTS%" (
    echo start.bat: requirements.txt not found at %REQUIREMENTS%.>&2
    popd
    exit /b 1
  )
  echo [start] Installing Python dependencies from requirements.txt...
  "%VENV_PY%" -m pip install --upgrade pip >nul
  "%VENV_PY%" -m pip install -r "%REQUIREMENTS%"
  if errorlevel 1 (
    echo start.bat: failed to install dependencies.>&2
    popd
    exit /b 1
  )
)

rem -------------------------------------------------------------------
rem Launch the API server.
rem -------------------------------------------------------------------
echo [start] Launching backend API server...
"%VENV_PY%" "%SCRIPT_DIR%server.py"
set "EXIT_CODE=%ERRORLEVEL%"

popd
endlocal & exit /b %EXIT_CODE%
