rem This batch file can be used to quickly setup PCs Windows 7 or more.
@echo off
rem Change Windows power settings to avoid the computer suspension or hibernation.
powercfg -hibernate off
powercfg -change -monitor-timeout-ac 30
powercfg -change -standby-timeout-ac 0
powercfg -change -disk-timeout-ac 0
rem Shutdown this computer after 10 hours (or 36000 seconds).
shutdown -s -t 36000
