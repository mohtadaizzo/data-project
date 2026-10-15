@ECHO OFF
REM EUROGATE MERN helpers
set PYTHONPATH=%~dp0.
IF DEFINED JAVA_HOME (
  REM keep user JAVA_HOME
) ELSE IF EXIST "C:\Program Files\Microsoft\jdk-11.0.31.11-hotspot" (
  set "JAVA_HOME=C:\Program Files\Microsoft\jdk-11.0.31.11-hotspot"
)
IF NOT DEFINED PYSPARK_PYTHON set PYSPARK_PYTHON=python
set PYSPARK_DRIVER_PYTHON=%PYSPARK_PYTHON%

IF "%1"=="etl" (
  python -m ai.pipeline.run_spark_etl
  GOTO :EOF
)
IF "%1"=="train" (
  python -m ai.training.train_all
  GOTO :EOF
)
IF "%1"=="ai" (
  uvicorn ai.serving.app:app --host 127.0.0.1 --port 8001 --reload
  GOTO :EOF
)
IF "%1"=="server" (
  cd server
  npm run dev
  GOTO :EOF
)
IF "%1"=="seed" (
  cd server
  npm run seed
  GOTO :EOF
)
IF "%1"=="client" (
  cd client
  npm run dev
  GOTO :EOF
)
ECHO Usage: run.bat [etl^|train^|ai^|server^|seed^|client]
