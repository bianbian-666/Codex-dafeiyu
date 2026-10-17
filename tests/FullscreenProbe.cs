using System;using System.IO;using System.Windows.Forms;using System.Runtime.InteropServices;
class FullscreenProbe:Form {
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 string output;int ticks;
 FullscreenProbe(string file){output=file;FormBorderStyle=FormBorderStyle.None;Bounds=Screen.PrimaryScreen.Bounds;Text="Desktop pet fullscreen regression test";BackColor=System.Drawing.Color.MidnightBlue;var label=new Label{Text="正在验证全屏不抢焦点，约 8 秒后自动关闭",ForeColor=System.Drawing.Color.White,AutoSize=true,Left=80,Top=80};Controls.Add(label);var t=new Timer{Interval=1000};t.Tick+=(s,e)=>{ticks++;if(ticks==5)File.WriteAllText(output,GetForegroundWindow()==Handle?"PASS":"FAIL");if(ticks==8)Close();};Shown+=(s,e)=>{Activate();t.Start();};}
 [STAThread]static void Main(string[] args){Application.Run(new FullscreenProbe(args[0]));}
}
