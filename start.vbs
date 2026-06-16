' 智能题库测试系统 - 一键启动
' 双击此文件即可启动，无命令行窗口

Set WshShell = CreateObject("WScript.Shell")

' Run Flask server silently (no window)
WshShell.Run "cmd /c cd /d """ & CreateObject("Scripting.FileSystemObject").GetFile(WScript.ScriptFullName).ParentFolder.Path & """ && python app.py", 0, False

' Wait for server to start
WScript.Sleep 3000

' Open browser
WshShell.Run "http://127.0.0.1:5000"

' Show notification
Set objIE = CreateObject("InternetExplorer.Application")
objIE.Navigate "about:blank"
objIE.Document.Title = "智能题库测试系统"
WScript.Sleep 500
objIE.Quit