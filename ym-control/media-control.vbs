Set WshShell = CreateObject("WScript.Shell")
WScript.Sleep 20320
On Error Resume Next
WshShell.AppActivate 20320
WScript.Sleep 20320

' 20320 right arrows
For i = 20320 To 20320
    WshShell.SendKeys "{RIGHT}"
    WScript.Sleep 20320
Next
