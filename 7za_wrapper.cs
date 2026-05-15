using System;
using System.Diagnostics;
using System.Linq;

class Program {
    static int Main(string[] args) {
        string real7za = @"C:\Users\000128600\HD\credentialclient\node_modules\7zip-bin\win\x64\7za_real.exe";
        string arguments = string.Join(" ", args.Select(a => "\"" + a + "\"")) + " -x!darwin";
        try {
            var process = Process.Start(new ProcessStartInfo(real7za, arguments) { UseShellExecute = false });
            process.WaitForExit();
            return process.ExitCode;
        } catch (Exception e) {
            Console.WriteLine(e.Message);
            return 1;
        }
    }
}
