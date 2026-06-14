param(
    [Parameter(Position = 0)]
    [string]$Message,
    [switch]$Silent,
    [string]$Photo
)

$python = "C:\Users\OLD\anaconda3\envs\chatterbox-tts\python.exe"
$script = "C:\Projects\opencode-tts\tools\post-telegram.py"

if ($Photo) {
    if ($Message) { & $python $script "--photo" $Photo $Message }
    else { & $python $script "--photo" $Photo }
} else {
    $args = @($Message)
    if ($Silent) { $args += "--silent" }
    & $python $script $args
}
