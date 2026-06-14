Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System;
public class AudioDevice {
    [DllImport("ole32.dll")]
    static extern int CoCreateInstance(ref Guid rclsid, IntPtr pUnkOuter, IntPtr dwClsContext, ref Guid riid, out IntPtr ppv);
    
    public static void SwitchToHeadphones() {
        var CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
        var IID_MMDeviceEnumerator = new Guid("A95664D2-9614-4F35-A746-DE8DB63617E6");
        var IID_MMDevice = new Guid("D666063F-1587-4E43-81F1-B948E807363F");
        var IID_MMDeviceCollection = new Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E");
        var DEVICE_STATE_ACTIVE = 1;
        var eRender = 0;
        var eMultimedia = 1;

        IntPtr pEnum;
        int hr = CoCreateInstance(ref CLSID_MMDeviceEnumerator, IntPtr.Zero, IntPtr.Zero, ref IID_MMDeviceEnumerator, out pEnum);
        if (hr != 0) { Console.WriteLine("Failed to create enumerator: " + hr); return; }

        try {
            var enumType = Marshal.GetObjectForIUnknown(pEnum).GetType();
            var devices = enumType.InvokeMember("EnumAudioEndpoints", System.Reflection.BindingFlags.InvokeMethod, null,
                Marshal.GetObjectForIUnknown(pEnum), new object[] { eRender, DEVICE_STATE_ACTIVE });
            var count = (int)devices.GetType().InvokeMember("Count", System.Reflection.BindingFlags.GetProperty, null, devices, null);
            
            for (int i = 0; i < count; i++) {
                var dev = devices.GetType().InvokeMember("Item", System.Reflection.BindingFlags.GetProperty, null, devices, new object[] { i });
                var propStore = dev.GetType().InvokeMember("OpenPropertyStore", System.Reflection.BindingFlags.InvokeMethod, null, dev, new object[] { 0 });
                var fmtid = new Guid("{A45C254E-DF1C-4EFD-8020-67D146A850E0}");
                var propKey = new System.Runtime.InteropServices.ComTypes.PROPERTYKEY { fmtid = fmtid, pid = 14 };
                var obj = propStore.GetType().InvokeMember("GetValue", System.Reflection.BindingFlags.InvokeMethod, null, propStore, new object[] { propKey });
                var val = obj?.GetType()?.GetProperty("Value")?.GetValue(obj, null);
                var name = val?.ToString() ?? "Unknown";
                Console.WriteLine($"{i}: {name}");
            }
        } finally {
            Marshal.ReleaseComObject(Marshal.GetObjectForIUnknown(pEnum));
        }
    }
}
'@ -ErrorAction SilentlyContinue
[AudioDevice]::SwitchToHeadphones()
