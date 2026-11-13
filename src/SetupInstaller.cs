using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace VelvetRedInstaller
{
    public class InstallerForm : Form
    {
        private CheckBox chkSpotX;
        private Button btnInstall;
        private Button btnRestore;
        private Button btnClose;
        private Label lblTitle;
        private Label lblSubtitle;
        private Label lblStatus;
        private Label lblDetect;
        private ProgressBar progress;
        private bool busy;

        [DllImport("user32.dll")]
        private static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        private static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);

        public InstallerForm()
        {
            Text = "Spotify Velvet Red Setup";
            Size = new Size(500, 320);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.None;
            BackColor = Color.FromArgb(19, 4, 8);
            ForeColor = Color.FromArgb(245, 240, 242);
            DoubleBuffered = true;

            try
            {
                using (Stream iconStream = ReadEmbeddedGzip("spotify-final.ico.gz"))
                {
                    if (iconStream != null)
                    {
                        Icon = new Icon(iconStream);
                    }
                }
            }
            catch { }

            lblTitle = new Label();
            lblTitle.Text = "Spotify Velvet Red Edition";
            lblTitle.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.BackColor = Color.Transparent;
            lblTitle.Location = new Point(26, 22);
            lblTitle.AutoSize = true;

            lblSubtitle = new Label();
            lblSubtitle.Text = "Windows 7 Aero Glass Theme + WMP Visualizer Studio";
            lblSubtitle.Font = new Font("Segoe UI", 9.5F, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(215, 172, 184);
            lblSubtitle.BackColor = Color.Transparent;
            lblSubtitle.Location = new Point(28, 54);
            lblSubtitle.AutoSize = true;

            lblDetect = new Label();
            lblDetect.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            lblDetect.ForeColor = Color.FromArgb(255, 175, 195);
            lblDetect.BackColor = Color.Transparent;
            lblDetect.Location = new Point(28, 86);
            lblDetect.Size = new Size(444, 34);

            chkSpotX = new CheckBox();
            chkSpotX.Text = "Install / Reapply SpotX first (ad-free & update shield)";
            chkSpotX.Font = new Font("Segoe UI", 9.5F, FontStyle.Regular);
            chkSpotX.ForeColor = Color.FromArgb(245, 228, 232);
            chkSpotX.BackColor = Color.Transparent;
            chkSpotX.Location = new Point(30, 128);
            chkSpotX.Size = new Size(440, 26);

            progress = new ProgressBar();
            progress.Location = new Point(28, 168);
            progress.Size = new Size(444, 14);
            progress.Style = ProgressBarStyle.Continuous;

            lblStatus = new Label();
            lblStatus.Text = "Ready to patch your installed Spotify client in place.";
            lblStatus.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(205, 180, 188);
            lblStatus.BackColor = Color.Transparent;
            lblStatus.Location = new Point(28, 192);
            lblStatus.Size = new Size(444, 42);

            btnInstall = CreateGlassButton("Install Theme", new Point(28, 250), new Size(168, 38), true);
            btnRestore = CreateGlassButton("Restore Vanilla", new Point(206, 250), new Size(146, 38), false);
            btnClose = CreateGlassButton("Close", new Point(362, 250), new Size(110, 38), false);

            btnInstall.Click += delegate { RunAction(true); };
            btnRestore.Click += delegate { RunAction(false); };
            btnClose.Click += delegate { Close(); };

            MouseEventHandler dragHandler = delegate(object s, MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Left)
                {
                    ReleaseCapture();
                    SendMessage(Handle, 0xA1, 0x2, 0);
                }
            };
            MouseDown += dragHandler;
            lblTitle.MouseDown += dragHandler;
            lblSubtitle.MouseDown += dragHandler;

            Controls.Add(lblTitle);
            Controls.Add(lblSubtitle);
            Controls.Add(lblDetect);
            Controls.Add(chkSpotX);
            Controls.Add(progress);
            Controls.Add(lblStatus);
            Controls.Add(btnInstall);
            Controls.Add(btnRestore);
            Controls.Add(btnClose);

            RefreshDetection();
        }

        private Button CreateGlassButton(string text, Point loc, Size sz, bool primary)
        {
            Button b = new Button();
            b.Text = text;
            b.Location = loc;
            b.Size = sz;
            b.FlatStyle = FlatStyle.Flat;
            b.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            b.Cursor = Cursors.Hand;
            b.ForeColor = Color.White;
            if (primary)
            {
                b.BackColor = Color.FromArgb(196, 30, 58);
                b.FlatAppearance.BorderColor = Color.FromArgb(255, 145, 170);
                b.FlatAppearance.MouseOverBackColor = Color.FromArgb(224, 32, 70);
            }
            else
            {
                b.BackColor = Color.FromArgb(46, 10, 20);
                b.FlatAppearance.BorderColor = Color.FromArgb(145, 55, 78);
                b.FlatAppearance.MouseOverBackColor = Color.FromArgb(72, 16, 32);
            }
            b.FlatAppearance.BorderSize = 1;
            return b;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            Rectangle rect = new Rectangle(0, 0, Width, Height);
            using (LinearGradientBrush brush = new LinearGradientBrush(
                rect,
                Color.FromArgb(62, 12, 26),
                Color.FromArgb(12, 2, 5),
                LinearGradientMode.Vertical))
            {
                e.Graphics.FillRectangle(brush, rect);
            }
            using (Pen borderPen = new Pen(Color.FromArgb(180, 255, 130, 155), 1))
            {
                e.Graphics.DrawRectangle(borderPen, 0, 0, Width - 1, Height - 1);
            }
        }

        private void RefreshDetection()
        {
            string dir = InstallerCore.GetSpotifyDir();
            string exe = Path.Combine(dir, "Spotify.exe");
            string spa = Path.Combine(dir, "Apps", "xpui.spa");
            if (!File.Exists(exe) || !File.Exists(spa))
            {
                lblDetect.Text = "Spotify Desktop not yet detected (SpotX can install latest).";
                chkSpotX.Checked = true;
                return;
            }
            string ver = FileVersionInfo.GetVersionInfo(exe).FileVersion ?? "Unknown";
            bool hasSpotX = InstallerCore.IsSpotXInstalled(spa);
            bool hasVelvet = InstallerCore.IsVelvetInstalled(spa);
            lblDetect.Text = string.Format(
                "Detected: Spotify v{0}  |  SpotX: {1}  |  Velvet Red: {2}",
                ver,
                hasSpotX ? "Active" : "Not Installed",
                hasVelvet ? "Installed" : "Not Installed");
            chkSpotX.Checked = !hasSpotX;
        }

        private void SetUiState(int pct, string msg, bool lockButtons)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(delegate { SetUiState(pct, msg, lockButtons); }));
                return;
            }
            progress.Value = Math.Max(0, Math.Min(100, pct));
            lblStatus.Text = msg;
            busy = lockButtons;
            btnInstall.Enabled = !lockButtons;
            btnRestore.Enabled = !lockButtons;
            btnClose.Enabled = !lockButtons;
            chkSpotX.Enabled = !lockButtons;
        }

        private void RunAction(bool install)
        {
            if (busy) return;
            bool runSpotX = install && chkSpotX.Checked;
            SetUiState(5, "Starting operation...", true);

            Thread t = new Thread(delegate()
            {
                try
                {
                    if (install)
                    {
                        InstallerCore.InstallAll(runSpotX, true, delegate(int pct, string msg)
                        {
                            SetUiState(pct, msg, true);
                        });
                        Invoke(new Action(delegate
                        {
                            RefreshDetection();
                            SetUiState(100, "Velvet Red Edition installed cleanly!", false);
                            MessageBox.Show(
                                "Spotify Velvet Red Edition + WMP Visualizer Studio is installed and Spotify has been launched.",
                                "Setup Complete",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Information);
                        }));
                    }
                    else
                    {
                        InstallerCore.RestoreVanilla(true, delegate(int pct, string msg)
                        {
                            SetUiState(pct, msg, true);
                        });
                        Invoke(new Action(delegate
                        {
                            RefreshDetection();
                            SetUiState(100, "Velvet Red theme removed cleanly (SpotX preserved).", false);
                            MessageBox.Show(
                                "Velvet Red files removed cleanly while keeping your Spotify & SpotX installation intact.",
                                "Restore Complete",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Information);
                        }));
                    }
                }
                catch (Exception ex)
                {
                    Invoke(new Action(delegate
                    {
                        SetUiState(0, "Error: " + ex.Message, false);
                        MessageBox.Show(ex.Message, "Velvet Red Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }));
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        internal static Stream ReadEmbeddedGzip(string suffix)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            string[] names = asm.GetManifestResourceNames();
            string target = null;
            for (int i = 0; i < names.Length; i++)
            {
                if (names[i].EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                {
                    target = names[i];
                    break;
                }
            }
            if (target == null) return null;
            using (Stream raw = asm.GetManifestResourceStream(target))
            using (GZipStream gz = new GZipStream(raw, CompressionMode.Decompress))
            {
                MemoryStream ms = new MemoryStream();
                gz.CopyTo(ms);
                ms.Position = 0;
                return ms;
            }
        }
    }

    internal static class InstallerCore
    {
        internal delegate void ProgressCallback(int pct, string msg);

        private static readonly string CssTag = "<link href=\"/velvet-red.css\" rel=\"stylesheet\">";
        private static readonly string JsTag = "<script defer=\"defer\" src=\"/lyrics-visualizer.js\"></script>";

        internal static string GetSpotifyDir()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Spotify");
        }

        internal static bool IsSpotXInstalled(string spaPath)
        {
            if (!File.Exists(spaPath)) return false;
            try
            {
                using (ZipArchive arc = ZipFile.OpenRead(spaPath))
                {
                    ZipArchiveEntry htmlEntry = arc.GetEntry("index.html");
                    if (htmlEntry != null)
                    {
                        using (StreamReader sr = new StreamReader(htmlEntry.Open(), Encoding.UTF8))
                        {
                            string html = sr.ReadToEnd();
                            if (html.IndexOf("spotx-helper", StringComparison.OrdinalIgnoreCase) >= 0) return true;
                        }
                    }
                    ZipArchiveEntry jsEntry = arc.GetEntry("xpui.js");
                    if (jsEntry != null)
                    {
                        using (StreamReader sr = new StreamReader(jsEntry.Open(), Encoding.UTF8))
                        {
                            string js = sr.ReadToEnd();
                            if (js.IndexOf("Patched by SpotX", StringComparison.OrdinalIgnoreCase) >= 0) return true;
                        }
                    }
                }
            }
            catch { }
            return false;
        }

        internal static bool IsVelvetInstalled(string spaPath)
        {
            if (!File.Exists(spaPath)) return false;
            try
            {
                using (ZipArchive arc = ZipFile.OpenRead(spaPath))
                {
                    return arc.GetEntry("velvet-red.css") != null && arc.GetEntry("lyrics-visualizer.js") != null;
                }
            }
            catch { }
            return false;
        }

        private static void KillSpotifyProcesses()
        {
            Process[] procs = Process.GetProcessesByName("Spotify");
            foreach (Process p in procs)
            {
                try
                {
                    p.Kill();
                    p.WaitForExit(4000);
                }
                catch { }
            }
            Thread.Sleep(450);
        }

        private static string StripTagsFromHtml(string html)
        {
            html = Regex.Replace(html, @"<link\b[^>]*velvet-red(?:-theme)?\.css[^>]*>", string.Empty, RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"<script\b[^>]*lyrics-visualizer\.js[^>]*>\s*</script>", string.Empty, RegexOptions.IgnoreCase);
            return html;
        }

        private static void DeleteEntryIfExists(ZipArchive arc, string entryName)
        {
            ZipArchiveEntry existing = arc.GetEntry(entryName);
            if (existing != null) existing.Delete();
        }

        private static void WriteEntryBytes(ZipArchive arc, string entryName, byte[] bytes)
        {
            DeleteEntryIfExists(arc, entryName);
            ZipArchiveEntry entry = arc.CreateEntry(entryName, CompressionLevel.Optimal);
            using (Stream s = entry.Open())
            {
                s.Write(bytes, 0, bytes.Length);
            }
        }

        internal static void StripVelvetRedFromSpa(string spaPath)
        {
            if (!File.Exists(spaPath)) return;
            using (ZipArchive arc = ZipFile.Open(spaPath, ZipArchiveMode.Update))
            {
                DeleteEntryIfExists(arc, "velvet-red.css");
                DeleteEntryIfExists(arc, "lyrics-visualizer.js");
                ZipArchiveEntry htmlEntry = arc.GetEntry("index.html");
                if (htmlEntry != null)
                {
                    string html;
                    using (StreamReader sr = new StreamReader(htmlEntry.Open(), Encoding.UTF8))
                    {
                        html = sr.ReadToEnd();
                    }
                    string cleaned = StripTagsFromHtml(html);
                    if (!string.Equals(html, cleaned, StringComparison.Ordinal))
                    {
                        WriteEntryBytes(arc, "index.html", Encoding.UTF8.GetBytes(cleaned));
                    }
                }
            }
        }

        internal static void RunSpotXInstaller(ProgressCallback report)
        {
            string scriptCmd =
                "$ProgressPreference='SilentlyContinue'; " +
                "$ErrorActionPreference='Stop'; " +
                "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " +
                "$urls = @('https://raw.githubusercontent.com/SpotX-Official/SpotX/refs/heads/main/run.ps1', 'https://spotx-official.github.io/SpotX/run.ps1'); " +
                "$code = $null; " +
                "foreach($u in $urls){ try { $code = (Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 25).Content; if($code){ break } } catch {} }; " +
                "if(-not $code){ throw 'Failed to download SpotX installer script.' }; " +
                "$code = $code.Replace('$_.ProcessName -like \"*spotify*\"', '($_.ProcessName -like \"*spotify*\" -and $_.ProcessName -notlike \"*VelvetRed*\")'); " +
                "$tmp = Join-Path $env:TEMP 'velvet_spotx_run.ps1'; " +
                "[IO.File]::WriteAllText($tmp, $code, [Text.Encoding]::UTF8); " +
                "try { & $tmp -new_theme -no_pause -podcasts_on -block_update_on -confirm_uninstall_ms_spoti -confirm_spoti_recomended_over -defender_exclusions_off -no_shortcut } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }";

            if (report != null) report(22, "Installing SpotX first (please wait)...");

            byte[] cmdBytes = Encoding.Unicode.GetBytes(scriptCmd);
            string encoded = Convert.ToBase64String(cmdBytes);

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -EncodedCommand " + encoded;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardInput = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;

            StringBuilder outBuf = new StringBuilder();
            StringBuilder errBuf = new StringBuilder();

            using (Process proc = new Process())
            {
                proc.StartInfo = psi;
                proc.OutputDataReceived += delegate(object s, DataReceivedEventArgs ev)
                {
                    if (!string.IsNullOrWhiteSpace(ev.Data))
                    {
                        lock (outBuf) { outBuf.AppendLine(ev.Data); }
                        if (report != null) report(42, "SpotX: " + ev.Data.Trim());
                    }
                };
                proc.ErrorDataReceived += delegate(object s, DataReceivedEventArgs ev)
                {
                    if (!string.IsNullOrWhiteSpace(ev.Data))
                    {
                        lock (errBuf) { errBuf.AppendLine(ev.Data); }
                    }
                };

                proc.Start();
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
                try { proc.StandardInput.Close(); } catch { }

                if (!proc.WaitForExit(180000))
                {
                    try { proc.Kill(); } catch { }
                    throw new InvalidOperationException("SpotX installer timed out after 180 seconds.");
                }
                proc.WaitForExit();

                if (proc.ExitCode != 0)
                {
                    string errText;
                    lock (errBuf) { errText = errBuf.ToString().Trim(); }
                    if (string.IsNullOrEmpty(errText))
                    {
                        lock (outBuf) { errText = outBuf.ToString().Trim(); }
                    }
                    throw new InvalidOperationException("SpotX installer failed: " + errText);
                }
            }
        }

        private static byte[] ReadEmbeddedBytes(string suffix)
        {
            using (Stream s = InstallerForm.ReadEmbeddedGzip(suffix))
            {
                if (s == null) throw new InvalidOperationException("Missing embedded payload: " + suffix);
                using (MemoryStream ms = new MemoryStream())
                {
                    s.CopyTo(ms);
                    return ms.ToArray();
                }
            }
        }

        private static void PatchSpaInPlace(string spaPath, byte[] cssBytes, byte[] jsBytes)
        {
            StripVelvetRedFromSpa(spaPath);

            using (ZipArchive arc = ZipFile.Open(spaPath, ZipArchiveMode.Update))
            {
                WriteEntryBytes(arc, "velvet-red.css", cssBytes);
                WriteEntryBytes(arc, "lyrics-visualizer.js", jsBytes);

                ZipArchiveEntry htmlEntry = arc.GetEntry("index.html");
                if (htmlEntry == null) throw new InvalidOperationException("Invalid xpui.spa: index.html missing.");
                string html;
                using (StreamReader sr = new StreamReader(htmlEntry.Open(), Encoding.UTF8))
                {
                    html = sr.ReadToEnd();
                }

                html = StripTagsFromHtml(html);

                if (html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    html = Regex.Replace(html, @"</head>", CssTag + "</head>", RegexOptions.IgnoreCase);
                }
                else
                {
                    html = CssTag + html;
                }

                if (html.IndexOf("</body>", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    html = Regex.Replace(html, @"</body>", JsTag + "</body>", RegexOptions.IgnoreCase);
                }
                else
                {
                    html = html + JsTag;
                }

                WriteEntryBytes(arc, "index.html", Encoding.UTF8.GetBytes(html));
            }
        }

        private static void UpdateShortcuts(string spotifyDir, string iconLocation)
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Windows\Start Menu\Programs\Spotify.lnk"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Spotify.lnk"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Spotify.lnk")
            };

            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return;
            object shell = Activator.CreateInstance(shellType);

            try
            {
                string exePath = Path.Combine(spotifyDir, "Spotify.exe");
                foreach (string lnk in candidates)
                {
                    if (!File.Exists(lnk) && !lnk.EndsWith(@"Start Menu\Programs\Spotify.lnk", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    try
                    {
                        object sc = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
                        if (sc != null)
                        {
                            Type scType = sc.GetType();
                            scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { exePath });
                            scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { spotifyDir });
                            scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { iconLocation });
                            scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
                            Marshal.ReleaseComObject(sc);
                        }
                    }
                    catch { }
                }
            }
            finally
            {
                Marshal.ReleaseComObject(shell);
            }
        }

        private static void ClearBrowserCacheSafe()
        {
            string localBrowser = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Spotify\Browser");
            string[] dirs = new string[]
            {
                Path.Combine(localBrowser, "Cache"),
                Path.Combine(localBrowser, "Code Cache")
            };
            foreach (string d in dirs)
            {
                try
                {
                    if (Directory.Exists(d)) Directory.Delete(d, true);
                }
                catch { }
            }
        }

        internal static void InstallAll(bool runSpotX, bool launchSpotify, ProgressCallback report)
        {
            string spotifyDir = GetSpotifyDir();
            string spaPath = Path.Combine(spotifyDir, "Apps", "xpui.spa");
            string exePath = Path.Combine(spotifyDir, "Spotify.exe");

            if (report != null) report(10, "Closing running Spotify instances...");
            KillSpotifyProcesses();

            if (File.Exists(spaPath))
            {
                StripVelvetRedFromSpa(spaPath);
            }

            if (runSpotX || !IsSpotXInstalled(spaPath))
            {
                RunSpotXInstaller(report);
            }

            if (!File.Exists(spaPath) || !File.Exists(exePath))
            {
                throw new InvalidOperationException("Spotify Desktop was not found in " + spotifyDir);
            }

            if (report != null) report(68, "Patching Velvet Red CSS & WMP Visualizer into xpui.spa...");
            byte[] cssBytes = ReadEmbeddedBytes("velvet-red.css.gz");
            byte[] jsBytes = ReadEmbeddedBytes("lyrics-visualizer.js.gz");
            PatchSpaInPlace(spaPath, cssBytes, jsBytes);

            if (report != null) report(84, "Installing Velvet Red icon & updating shortcuts...");
            byte[] icoBytes = ReadEmbeddedBytes("spotify-final.ico.gz");
            string icoPath = Path.Combine(spotifyDir, "velvet_red.ico");
            File.WriteAllBytes(icoPath, icoBytes);
            UpdateShortcuts(spotifyDir, icoPath + ",0");

            if (report != null) report(92, "Clearing stale CEF asset cache...");
            ClearBrowserCacheSafe();

            if (launchSpotify)
            {
                if (report != null) report(97, "Launching Spotify Velvet Red Edition...");
                ProcessStartInfo lpi = new ProcessStartInfo(exePath);
                lpi.WorkingDirectory = spotifyDir;
                Process.Start(lpi);
            }
        }

        internal static void RestoreVanilla(bool launchSpotify, ProgressCallback report)
        {
            string spotifyDir = GetSpotifyDir();
            string spaPath = Path.Combine(spotifyDir, "Apps", "xpui.spa");
            string exePath = Path.Combine(spotifyDir, "Spotify.exe");

            if (report != null) report(20, "Closing Spotify...");
            KillSpotifyProcesses();

            if (File.Exists(spaPath))
            {
                if (report != null) report(55, "Removing Velvet Red patches while preserving SpotX...");
                StripVelvetRedFromSpa(spaPath);
            }

            if (report != null) report(80, "Restoring default shortcut icon...");
            UpdateShortcuts(spotifyDir, exePath + ",0");
            ClearBrowserCacheSafe();

            if (launchSpotify && File.Exists(exePath))
            {
                if (report != null) report(95, "Starting Spotify...");
                ProcessStartInfo lpi = new ProcessStartInfo(exePath);
                lpi.WorkingDirectory = spotifyDir;
                Process.Start(lpi);
            }
        }
    }

    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            bool silent = false;
            bool forceSpotX = false;
            bool uninstall = false;
            bool startAfter = false;

            for (int i = 0; i < args.Length; i++)
            {
                string a = (args[i] ?? string.Empty).Trim().ToUpperInvariant();
                if (a == "/S" || a == "-S" || a == "--SILENT") silent = true;
                else if (a == "/SPOTX" || a == "--SPOTX") forceSpotX = true;
                else if (a == "/UNINSTALL" || a == "/RESTORE" || a == "--RESTORE") uninstall = true;
                else if (a == "/START" || a == "--START") startAfter = true;
            }

            if (silent)
            {
                try
                {
                    if (uninstall)
                    {
                        InstallerCore.RestoreVanilla(startAfter, null);
                    }
                    else
                    {
                        InstallerCore.InstallAll(forceSpotX, startAfter, null);
                    }
                    return 0;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine(ex.Message);
                    return 1;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
            return 0;
        }
    }
}
