using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using System.Runtime.InteropServices;

[assembly: AssemblyTitle("Spotify WMP11 Velvet Red Edition Setup")]
[assembly: AssemblyDescription("Standalone Installer for Spotify Windows 7 Aero & WMP 11 Velvet Red Theme + WMC Visualizer")]
[assembly: AssemblyCompany("Retro Aero Mod")]
[assembly: AssemblyProduct("Spotify WMP11 Velvet Red Edition")]
[assembly: AssemblyVersion("5.1.0.0")]

namespace SpotifyRetroSetup
{
    public class SetupForm : Form
    {
        private Button btnInstall;
        private Button btnRestore;
        private Label lblStatus;
        private ProgressBar progressBar;

        [DllImport("shell32.dll")]
        private static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);

        public SetupForm()
        {
            this.Text = "Spotify - Windows 7 Aero & WMP 11 Velvet Red Setup";
            this.Size = new Size(540, 340);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(18, 4, 9);
            this.ForeColor = Color.FromArgb(245, 240, 242);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { }

            Label lblTitle = new Label();
            lblTitle.Text = "Spotify WMP 11 Velvet Red Edition";
            lblTitle.Font = new Font("Segoe UI", 16f, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(255, 95, 125);
            lblTitle.AutoSize = false;
            lblTitle.Bounds = new Rectangle(28, 22, 470, 34);
            lblTitle.BackColor = Color.Transparent;
            this.Controls.Add(lblTitle);

            Label lblDesc = new Label();
            lblDesc.Text = "Features:\r\n" +
                           "  • Authentic Windows 7 Aero Glass & WMP 11 Velvet Red UI\r\n" +
                           "  • Perfectly Centered WMP 11 Transport Controls\r\n" +
                           "  • Windows Media Center (Vista) Multi-Edge Rhythm Visualizer\r\n" +
                           "  • Custom Multi-Resolution Glossy Red Spotify App Icon";
            lblDesc.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            lblDesc.ForeColor = Color.FromArgb(225, 205, 212);
            lblDesc.Bounds = new Rectangle(30, 62, 470, 105);
            lblDesc.BackColor = Color.Transparent;
            this.Controls.Add(lblDesc);

            progressBar = new ProgressBar();
            progressBar.Bounds = new Rectangle(30, 178, 465, 18);
            progressBar.Minimum = 0;
            progressBar.Maximum = 100;
            progressBar.Value = 0;
            this.Controls.Add(progressBar);

            lblStatus = new Label();
            lblStatus.Text = "Ready to install to %APPDATA%\\Spotify.";
            lblStatus.Font = new Font("Segoe UI", 9f, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(190, 165, 175);
            lblStatus.Bounds = new Rectangle(30, 204, 465, 24);
            lblStatus.BackColor = Color.Transparent;
            this.Controls.Add(lblStatus);

            btnInstall = new Button();
            btnInstall.Text = "Install && Launch Spotify";
            btnInstall.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            btnInstall.Bounds = new Rectangle(30, 238, 295, 42);
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.BackColor = Color.FromArgb(196, 30, 58);
            btnInstall.ForeColor = Color.White;
            btnInstall.FlatAppearance.BorderColor = Color.FromArgb(255, 160, 180);
            btnInstall.Cursor = Cursors.Hand;
            btnInstall.Click += (s, e) => RunInstall(false);
            this.Controls.Add(btnInstall);

            btnRestore = new Button();
            btnRestore.Text = "Restore Backup";
            btnRestore.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            btnRestore.Bounds = new Rectangle(340, 238, 155, 42);
            btnRestore.FlatStyle = FlatStyle.Flat;
            btnRestore.BackColor = Color.FromArgb(42, 12, 20);
            btnRestore.ForeColor = Color.FromArgb(235, 210, 220);
            btnRestore.FlatAppearance.BorderColor = Color.FromArgb(120, 45, 65);
            btnRestore.Cursor = Cursors.Hand;
            btnRestore.Click += (s, e) => RunRestore();
            this.Controls.Add(btnRestore);
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            using (LinearGradientBrush brush = new LinearGradientBrush(
                this.ClientRectangle,
                Color.FromArgb(52, 10, 22),
                Color.FromArgb(10, 2, 5),
                LinearGradientMode.Vertical))
            {
                e.Graphics.FillRectangle(brush, this.ClientRectangle);
            }
        }

        public static void ExtractResource(string resName, string outPath)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream(resName))
            {
                if (s == null) throw new Exception("Missing embedded resource: " + resName);
                using (GZipStream gz = new GZipStream(s, CompressionMode.Decompress))
                using (FileStream fs = new FileStream(outPath, FileMode.Create, FileAccess.Write))
                {
                    gz.CopyTo(fs);
                }
            }
        }

        private static void KillSpotify()
        {
            foreach (Process p in Process.GetProcessesByName("Spotify"))
            {
                try { p.Kill(); p.WaitForExit(3000); } catch { }
            }
        }

        private static void UpdateShortcuts(string icoPath)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                dynamic shell = Activator.CreateInstance(shellType);
                string[] lnkPaths = new string[]
                {
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Spotify.lnk"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Windows\Start Menu\Programs\Spotify.lnk"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Spotify.lnk")
                };

                foreach (string lnk in lnkPaths)
                {
                    if (File.Exists(lnk))
                    {
                        try
                        {
                            dynamic shortcut = shell.CreateShortcut(lnk);
                            shortcut.IconLocation = icoPath + ",0";
                            shortcut.Save();
                        }
                        catch { }
                    }
                }
                SHChangeNotify(0x08000000, 0x0000, IntPtr.Zero, IntPtr.Zero);
            }
            catch { }
        }

        public void RunInstall(bool silent)
        {
            try
            {
                if (!silent)
                {
                    btnInstall.Enabled = false;
                    btnRestore.Enabled = false;
                    lblStatus.Text = "Closing running Spotify processes...";
                    progressBar.Value = 15;
                    Application.DoEvents();
                }

                KillSpotify();

                string spotifyDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Spotify");
                string appsDir = Path.Combine(spotifyDir, "Apps");
                Directory.CreateDirectory(appsDir);

                string xpuiPath = Path.Combine(appsDir, "xpui.spa");
                string bakPath = Path.Combine(appsDir, "xpui.spa.original_bak");
                string icoPath = Path.Combine(spotifyDir, "spotify-final.ico");

                if (File.Exists(xpuiPath) && !File.Exists(bakPath))
                {
                    File.Copy(xpuiPath, bakPath, false);
                }

                if (!silent)
                {
                    lblStatus.Text = "Installing WMP 11 Velvet Red xpui.spa & WMC Visualizer...";
                    progressBar.Value = 55;
                    Application.DoEvents();
                }

                ExtractResource("xpui.spa.gz", xpuiPath);
                ExtractResource("spotify-final.ico.gz", icoPath);

                if (!silent)
                {
                    lblStatus.Text = "Updating Desktop, Start Menu & Taskbar Icons...";
                    progressBar.Value = 85;
                    Application.DoEvents();
                }

                UpdateShortcuts(icoPath);

                if (!silent)
                {
                    progressBar.Value = 100;
                    lblStatus.Text = "Installation complete! Launching Spotify...";
                    Application.DoEvents();
                }

                string exePath = Path.Combine(spotifyDir, "Spotify.exe");
                if (File.Exists(exePath))
                {
                    Process.Start(exePath);
                }

                if (!silent)
                {
                    MessageBox.Show(
                        "Spotify Windows 7 Aero & WMP 11 Velvet Red Edition has been installed successfully!",
                        "Setup Complete",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    this.Close();
                }
            }
            catch (Exception ex)
            {
                if (!silent)
                {
                    lblStatus.Text = "Error: " + ex.Message;
                    btnInstall.Enabled = true;
                    btnRestore.Enabled = true;
                    MessageBox.Show("Installation failed:\r\n" + ex.Message, "Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private void RunRestore()
        {
            try
            {
                KillSpotify();
                string spotifyDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Spotify");
                string xpuiPath = Path.Combine(spotifyDir, "Apps", "xpui.spa");
                string bakPath = Path.Combine(spotifyDir, "Apps", "xpui.spa.original_bak");

                if (File.Exists(bakPath))
                {
                    File.Copy(bakPath, xpuiPath, true);
                    progressBar.Value = 100;
                    lblStatus.Text = "Original Spotify backup restored.";
                    MessageBox.Show("Original Spotify UI has been restored!", "Restore Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    MessageBox.Show("No backup file (xpui.spa.original_bak) was found.", "Restore", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Restore failed:\r\n" + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            SetupForm form = new SetupForm();
            if (args.Length > 0 && (args[0] == "/S" || args[0] == "--silent" || args[0] == "/silent"))
            {
                form.RunInstall(true);
                return;
            }
            Application.Run(form);
        }
    }
}
