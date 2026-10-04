using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

class HostWrapper
{
    static int Main(string[] args)
    {
        try
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            string scriptPath = Path.Combine(dir, "host.js");

            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = "node.exe",
                Arguments = "\"" + scriptPath + "\"",
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            using (Process proc = Process.Start(psi))
            {
                Task inTask = Task.Run(() =>
                {
                    try
                    {
                        using (Stream cin = Console.OpenStandardInput())
                        using (Stream pin = proc.StandardInput.BaseStream)
                        {
                            cin.CopyTo(pin);
                        }
                    }
                    catch { }
                });

                Task outTask = Task.Run(() =>
                {
                    try
                    {
                        using (Stream cout = Console.OpenStandardOutput())
                        using (Stream pout = proc.StandardOutput.BaseStream)
                        {
                            pout.CopyTo(cout);
                        }
                    }
                    catch { }
                });

                proc.WaitForExit();
                return proc.ExitCode;
            }
        }
        catch (Exception)
        {
            return 1;
        }
    }
}
